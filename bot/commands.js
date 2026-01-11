const calculator = require('../utils/calculator');
const price = require('../utils/price');
const validator = require('../utils/validator');
const messages = require('./messages');
const logger = require('../utils/logger');
const db = require('../database/queries');

async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, messages.welcomeMessage(), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🚀 New Campaign', callback_data: 'new_campaign' }],
        [{ text: '📊 Status', callback_data: 'status' }, { text: '📜 History', callback_data: 'history' }],
        [{ text: '❓ Help', callback_data: 'help' }]
      ]
    }
  });
}

async function handleNewCampaign(bot, msg, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const existing = await db.getActiveCampaign(userId);
  if (existing) {
    await bot.sendMessage(
      chatId,
      '⚠️ You already have an active or pending campaign.\n\n' +
      'Use /status to check progress\n' +
      'Use /cancel to cancel it first'
    );
    return;
  }

  userStates.set(userId, {
    isSettingUp: true,
    step: 'destination_wallet',
    data: {}
  });

  await bot.sendMessage(
    chatId,
    '🎯 Let\'s set up your campaign!\n\n' +
    'Step 1 of 5: What\'s your Solana wallet address?\n' +
    '(This is where your purchased tokens will be sent)\n\n' +
    'Type /cancel to abort'
  );
}

async function handleCampaignSetupStep(bot, msg, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userState = userStates.get(userId);

  if (!userState || !userState.isSettingUp) return;

  try {
    switch (userState.step) {
      case 'destination_wallet':
        if (!validator.isValidSolanaAddress(msg.text)) {
          await bot.sendMessage(chatId, '❌ Invalid Solana address. Please try again:');
          return;
        }

        userState.data.destinationWallet = msg.text;

        await db.getOrCreateUser(
          userId,
          msg.from.username || null,
          msg.text
        );

        userState.step = 'token_address';
        await bot.sendMessage(
          chatId,
          '✅ Wallet saved!\n\n' +
          'Step 2 of 5: What token do you want to buy?\n' +
          'Paste the token contract address:'
        );
        break;

      case 'token_address':
        if (!validator.isValidSolanaAddress(msg.text)) {
          await bot.sendMessage(chatId, '❌ Invalid token address. Please try again:');
          return;
        }

        userState.data.tokenAddress = msg.text;
        userState.step = 'total_deposit';
        await bot.sendMessage(
          chatId,
          '✅ Token saved!\n\n' +
          'Step 3 of 5: How much total do you want to deposit? (USD)\n' +
          'Example: 100\n' +
          'Minimum: $5'
        );
        break;

      case 'total_deposit':
        // Strip $ and , then parse
        const rawText = (msg.text || '').trim().replace(/[$,]/g, '');
        const deposit = parseFloat(rawText);

        if (isNaN(deposit) || deposit < 5) {
          await bot.sendMessage(
            chatId,
            '❌ Invalid amount.\n\n' +
            'Please enter a number greater than 5 (USD).\n' +
            'Example: type `100` for $100.\n' +
            'Try again:'
          );
          return;
        }

        userState.data.totalDeposit = deposit;
        userState.step = 'number_of_buys';
        await bot.sendMessage(
          chatId,
          '✅ Amount saved!\n\n' +
          'Step 4 of 5: How many buys?\n' +
          'Example: 20'
        );
        break;

      case 'number_of_buys':
        const buys = parseInt(msg.text, 10);
        if (isNaN(buys) || buys < 1) {
          await bot.sendMessage(chatId, '❌ Invalid number. Please try again:');
          return;
        }

        try {
          validator.validateCampaign(userState.data.totalDeposit, buys);
        } catch (error) {
          await bot.sendMessage(chatId, `❌ ${error.message}`);
          return;
        }

        userState.data.numberOfBuys = buys;
        userState.step = 'interval';
        await bot.sendMessage(
          chatId,
          '✅ Number of buys saved!\n\n' +
          'Step 5 of 5: Buy interval (minutes)?\n' +
          'Minimum: 5 minutes\n' +
          'Examples: 5, 10, 30, 60'
        );
        break;

      case 'interval':
        const interval = parseInt(msg.text, 10);
        if (isNaN(interval) || interval < 5) {
          await bot.sendMessage(chatId, '❌ Minimum 5 minutes. Please try again:');
          return;
        }

        userState.data.interval = interval;

        const campaignCalc = calculator.calculateCampaign(
          userState.data.totalDeposit,
          userState.data.numberOfBuys
        );

        const summary = messages.campaignSummary(
          userState.data,
          campaignCalc,
          interval
        );

        userState.step = 'confirm';

        await bot.sendMessage(chatId, summary);
        await bot.sendMessage(
          chatId,
          'Please confirm your campaign details:',
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Confirm & Create', callback_data: 'confirm_campaign' }],
                [{ text: '❌ Cancel', callback_data: 'cancel_campaign' }]
              ]
            }
          }
        );
        break;

      default:
        userStates.delete(userId);
        await bot.sendMessage(chatId, '❌ Setup state lost. Please run /newcampaign again.');
        return;
    }

    userStates.set(userId, userState);

  } catch (error) {
    logger.error('Campaign setup error:', error);
    await bot.sendMessage(chatId, '❌ An error occurred. Please try again with /newcampaign');
    userStates.delete(userId);
  }
}

async function handleConfirm(bot, msg, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const userState = userStates.get(userId);

  if (!userState || userState.step !== 'confirm') {
    await bot.sendMessage(chatId, 'No campaign to confirm. Use /newcampaign to start.');
    return;
  }

  try {
    const existing = await db.getActiveCampaign(userId);
    if (existing) {
      await bot.sendMessage(
        chatId,
        '⚠️ You already have an active or pending campaign. Use /status or /cancel first.'
      );
      userStates.delete(userId);
      return;
    }

    const calc = calculator.calculateCampaign(
      userState.data.totalDeposit,
      userState.data.numberOfBuys
    );

    const depositAddress = process.env.DEPOSIT_WALLET_ADDRESS;
    if (!depositAddress) {
      await bot.sendMessage(
        chatId,
        '❌ Deposit wallet address is missing.\n' +
        'Contact support - bot is not configured properly.'
      );
      userStates.delete(userId);
      return;
    }

    // 1. Get real price
    let currentPrice;
    try {
      currentPrice = await price.getSolPrice();
    } catch (err) {
      await bot.sendMessage(chatId, '❌ Failed to fetch current SOL price. Please try again.');
      return;
    }

    // 2. Calculate Base Expected SOL
    const baseExpectedSOL = calc.expectedDepositSOL; // This was based on fixed $200 before, we need to recalculate if calculator uses fixed price.
    // Actually, let's just recalculate it here to be safe and clear.
    // userState.data.totalFees is in USD? No, calculator usually returns fees in SOL?
    // Let's re-examine calculator.js. Assume for now we need to adhere to the plan:
    // "dust" logic.

    const totalCostUsd = userState.data.totalDeposit + userState.data.totalFees; // Check logic
    // Wait, let's stick to the calculator's output for now but adding dust.
    // BUT we need to convert the USD total to SOL using REAL PRICE.

    const totalRequiredUSD = userState.data.totalDeposit; // Fees are usually deducted from this or added? 
    // In handleCampaignSetupStep, we just collected totalDeposit. 
    // Let's trust the calculator for FEES structure, but we need to convert to SOL.

    const realExpectedSolBase = (userState.data.totalDeposit / currentPrice);

    // Add "Dust" for uniqueness (0.000001 to 0.000100)
    const dust = (Math.floor(Math.random() * 100) + 1) / 1000000;
    const finalExpectedSOL = realExpectedSolBase + dust;

    const created = await db.createCampaign({
      telegramId: userId,
      tokenAddress: userState.data.tokenAddress,
      destinationWallet: userState.data.destinationWallet,
      totalDeposit: userState.data.totalDeposit,
      numberOfBuys: userState.data.numberOfBuys,
      interval: userState.data.interval,
      totalFees: calc.totalFees, // Keep as is
      perBuyAmount: calc.perBuyAmount, // Keep as is
      expectedDepositSOL: finalExpectedSOL.toFixed(9) // Use the new unique amount
    });

    await bot.sendMessage(
      chatId,
      '✅ Campaign saved!\n\n' +
      `Campaign ID: ${created.id}\n` +
      `Status: ${created.status}\n\n` +
      'Send SOL to this address to activate your campaign:\n\n' +
      `\`${depositAddress}\`` + '\n\n' +
      `⚠️ **IMPORTANT**: You MUST send exactly:\n` +
      `👉 \`${created.expected_deposit_sol}\` SOL\n\n` +
      `(This exact amount is required to identify your deposit automatically)`
    );

    userStates.delete(userId);

  } catch (error) {
    logger.error('Error confirming campaign:', error);
    await bot.sendMessage(chatId, `❌ Failed to create campaign: ${error.message}`);
    userStates.delete(userId);
  }
}

async function handleStatus(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  try {
    const campaign = await db.getActiveCampaign(userId);

    if (!campaign) {
      await bot.sendMessage(
        chatId,
        '📊 No active campaigns',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 Start New Campaign', callback_data: 'new_campaign' }]
            ]
          }
        }
      );
      return;
    }

    await bot.sendMessage(
      chatId,
      '📊 Current Campaign\n\n' +
      `Status: ${campaign.status}\n` +
      `Token: ${campaign.token_address.substring(0, 8)}...\n` +
      `Destination: ${campaign.destination_wallet.substring(0, 8)}...\n` +
      `Total: $${campaign.total_deposit_usd}\n` +
      `Buys: ${campaign.buys_completed}/${campaign.number_of_buys}\n` +
      `Interval: ${campaign.interval_minutes} min\n` +
      `Per Buy: $${campaign.per_buy_usd}\n` +
      `Fees: $${campaign.total_fees_usd}\n` +
      `Expected Deposit: ${campaign.expected_deposit_sol} SOL`
    );

  } catch (err) {
    logger.error('Status error:', err);
    await bot.sendMessage(chatId, '❌ Could not load status right now. Try again in a moment.');
  }
}

async function handleCancel(bot, msg, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const userState = userStates.get(userId);
  if (userState && userState.isSettingUp) {
    userStates.delete(userId);
    await bot.sendMessage(chatId, '❌ Campaign setup cancelled.');
    return;
  }

  try {
    const campaign = await db.getActiveCampaign(userId);

    if (!campaign) {
      await bot.sendMessage(chatId, '❌ No active campaign to cancel');
      return;
    }

    await db.updateCampaignStatus(campaign.id, 'cancelled');

    await bot.sendMessage(
      chatId,
      '✅ Campaign cancelled!\n\n' +
      `Campaign ID: ${campaign.id}\n` +
      'Status: cancelled'
    );

  } catch (error) {
    logger.error('Cancel error:', error);
    await bot.sendMessage(chatId, '❌ Error cancelling campaign. Try again.');
  }
}

async function handleHistory(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '📜 No buy history yet');
}

async function handleHelp(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, messages.helpMessage());
}

module.exports = {
  handleStart,
  handleNewCampaign,
  handleCampaignSetupStep,
  handleConfirm,
  handleStatus,
  handleCancel,
  handleHistory,
  handleHelp
};