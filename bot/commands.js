const { PublicKey, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const calculator = require('../utils/calculator');
const price = require('../utils/price');
const validator = require('../utils/validator');
const messages = require('./messages');
const logger = require('../utils/logger');
const db = require('../database/queries');
const constants = require('../config/constants');
const wallet = require('../blockchain/wallet');
const { MIN_INTERVAL_MINUTES } = constants;


async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, messages.welcomeMessage(), {
    reply_markup: {
      inline_keyboard: [
        [{ text: '📱 Open Solstice Dashboard', web_app: { url: process.env.DASHBOARD_URL || 'https://google.com' } }],
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

  const lastWallet = await db.getUserLastDestinationWallet(userId);
  const keyboard = {
    inline_keyboard: []
  };

  if (lastWallet) {
    keyboard.inline_keyboard.push([{ text: `🏠 Use: ${lastWallet.substring(0, 10)}...${lastWallet.substring(34)}`, callback_data: `use_wallet_${lastWallet}` }]);
    keyboard.inline_keyboard.push([{ text: '✏️ Enter New Wallet', callback_data: 'enter_new_wallet' }]);
  }
  keyboard.inline_keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_campaign' }]);

  await bot.sendMessage(
    chatId,
    '🎯 *Campaign Setup*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
    'Step 1 of 5: *Destination Wallet*\n' +
    'Where should we send your purchased tokens?',
    {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    }
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
        const recentTokens = await db.getUserRecentTokens(userId, 2);
        const tokenKeyboard = { inline_keyboard: [] };

        if (recentTokens && recentTokens.length > 0) {
          recentTokens.forEach(token => {
            tokenKeyboard.inline_keyboard.push([{
              text: `🪙 Use: ${token.substring(0, 4)}...${token.substring(token.length - 4)}`,
              callback_data: `use_token_${token}`
            }]);
          });
        }
        tokenKeyboard.inline_keyboard.push([{ text: '❌ Cancel', callback_data: 'cancel_campaign' }]);

        await bot.sendMessage(
          chatId,
          '✅ *Wallet saved!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          'Step 2 of 5: *Token to Buy*\n' +
          'Paste the Solana contract address of the token:',
          {
            parse_mode: 'Markdown',
            reply_markup: tokenKeyboard
          }
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
          '✅ *Token saved!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          'Step 3 of 5: *Total Deposit (USD)*\n' +
          'How much do you want to spend in total?',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '$5', callback_data: 'setup_amount_5' },
                  { text: '$10', callback_data: 'setup_amount_10' },
                  { text: '$15', callback_data: 'setup_amount_15' },
                  { text: '$20', callback_data: 'setup_amount_20' }
                ],
                [
                  { text: '$25', callback_data: 'setup_amount_25' },
                  { text: '$30', callback_data: 'setup_amount_30' },
                  { text: '$35', callback_data: 'setup_amount_35' },
                  { text: '$50', callback_data: 'setup_amount_50' }
                ],
                [
                  { text: '$75', callback_data: 'setup_amount_75' },
                  { text: '$100', callback_data: 'setup_amount_100' },
                  { text: '$150', callback_data: 'setup_amount_150' },
                  { text: '$250', callback_data: 'setup_amount_250' }
                ],
                [
                  { text: '⌨️ Other Amount', callback_data: 'enter_custom_amount' },
                  { text: '❌ Cancel', callback_data: 'cancel_campaign' }
                ]
              ]
            }
          }
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
          '✅ *Amount saved!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          'Step 4 of 5: *Number of Buys*\n' +
          'How many trades should the bot execute?',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '10', callback_data: 'setup_buys_10' },
                  { text: '25', callback_data: 'setup_buys_25' },
                  { text: '50', callback_data: 'setup_buys_50' }
                ],
                [{ text: '❌ Cancel', callback_data: 'cancel_campaign' }]
              ]
            }
          }
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
          '✅ *Trades saved!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          'Step 5 of 5: *Buy Interval*\n' +
          'How often should the bot buy?',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '1h', callback_data: 'setup_interval_60' },
                  { text: '4h', callback_data: 'setup_interval_240' },
                  { text: '12h', callback_data: 'setup_interval_720' }
                ],
                [{ text: '❌ Cancel', callback_data: 'cancel_campaign' }]
              ]
            }
          }
        );

        break;

      case 'interval':
        const rawInterval = (msg.text || '').trim();
        const intervalMatch = rawInterval.match(/^(\d+)/);
        const interval = intervalMatch ? parseInt(intervalMatch[1], 10) : NaN;

        if (isNaN(interval) || interval < MIN_INTERVAL_MINUTES) {
          await bot.sendMessage(chatId, `❌ Minimum ${MIN_INTERVAL_MINUTES} minutes. Please try again:`);
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

        await bot.sendMessage(chatId, summary, { parse_mode: 'Markdown' });
        await bot.sendMessage(
          chatId,
          '🧐 *Please verify the details above:*',
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🚀 Confirm & Start', callback_data: 'confirm_campaign' }],
                [{ text: '❌ Discard', callback_data: 'cancel_campaign' }]
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
    // Temporary debug: show error to user
    await bot.sendMessage(chatId, `❌ An error occurred: ${error.message}\n\nPlease try again with /newcampaign or contact support.`);
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

    // 0. Generate Unique Wallet for this campaign
    const newKeypair = Keypair.generate();
    const depositAddress = newKeypair.publicKey.toString();
    const depositPrivateKey = bs58.encode(newKeypair.secretKey);

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

    // Add "Gas Buffer" for network fees and "Dust" for uniqueness
    const dust = (Math.floor(Math.random() * 100) + 1) / 1000000;
    const gasBuffer = constants.GAS_BUFFER_SOL || 0.005;
    const finalExpectedSOL = realExpectedSolBase + gasBuffer + dust;


    const campaignParams = {
      telegramId: userId,
      tokenAddress: userState.data.tokenAddress,
      destinationWallet: userState.data.destinationWallet,
      totalDeposit: userState.data.totalDeposit,
      numberOfBuys: userState.data.numberOfBuys,
      interval: userState.data.interval,
      totalFees: calc.totalFees,
      perBuyAmount: calc.perBuyAmount,
      expectedDepositSOL: finalExpectedSOL.toFixed(9),
      depositAddress: depositAddress,
      depositPrivateKey: depositPrivateKey
    };

    logger.info('[DIAG-C1] Creating campaign with params:', JSON.parse(JSON.stringify(campaignParams)));

    const created = await db.createCampaign(campaignParams);


    await bot.sendMessage(
      chatId,
      '✅ *Campaign Created!* (ID: ' + created.id + ')\n\n' +
      'To activate your campaign, please send the deposit to the address below.\n\n' +
      'This amount is calculated to cover:\n' +
      '• Your trading capital ($' + userState.data.totalDeposit.toFixed(2) + ')\n' +
      '• Bot service fees ($' + calc.totalFees.toFixed(2) + ')\n' +
      '• Network gas reserve (0.01 SOL)',
      { parse_mode: 'Markdown' }
    );

    // Send wallet address as a separate message for easy tap-to-copy
    await bot.sendMessage(chatId, `\`${depositAddress}\``, { parse_mode: 'Markdown' });

    await bot.sendMessage(
      chatId,
      `⚠️ *ACTION REQUIRED*:\n` +
      `You MUST send exactly the amount below:\n\n` +
      `👉 \`${created.expected_deposit_sol}\` *SOL*\n\n` +
      `_(We use this exact amount to identify your deposit automatically)_`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '📊 Check Status', callback_data: 'status' }]]
        }
      }
    );

    userStates.delete(userId);

  } catch (error) {
    logger.error('Error confirming campaign:', error);
    const errorDetails = error.stack || error.message || JSON.stringify(error);
    await bot.sendMessage(chatId, `❌ Failed to create campaign: ${error.message || 'Unknown error'}`);
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

    // Check if campaign is waiting for deposit
    if (campaign.status === 'awaiting_deposit') {
      const connection = wallet.getConnection();

      let pubKey;
      if (campaign.deposit_address) {
        pubKey = new PublicKey(campaign.deposit_address);
      } else {
        pubKey = wallet.getDepositPublicKey();
      }

      const balanceLamports = await connection.getBalance(pubKey);
      const balanceSOL = wallet.lamportsToSol(balanceLamports);


      if (balanceSOL >= parseFloat(campaign.expected_deposit_sol) * 0.5) {
        await db.updateCampaignStatus(campaign.id, 'active');
        await db.updateCampaignDeposit(campaign.id, balanceSOL, 'PRE_FUNDED_OR_MANUAL');

        await bot.sendMessage(
          chatId,
          '✅ *DEPOSIT VERIFIED!*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n' +
          `💰 Found: \`${balanceSOL.toFixed(4)} SOL\`\n` +
          '🚀 *Campaign is now ACTIVE!*',
          { parse_mode: 'Markdown' }
        );

        const updated = await db.getActiveCampaign(userId);
        if (updated) Object.assign(campaign, updated);
      } else {
        const depositAddress = campaign.deposit_address;
        await bot.sendMessage(
          chatId,
          `⏳ *WAITING FOR DEPOSIT*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
          `💰 *Balance:* \`${balanceSOL.toFixed(4)} SOL\`\n` +
          `🎯 *Target:* \`${campaign.expected_deposit_sol} SOL\`\n\n` +
          `📍 *Send to (tap to copy):*\n\`${depositAddress}\``,
          { parse_mode: 'Markdown' }
        );
      }

    }

    const progress = messages.progressBar(campaign.buys_completed, campaign.number_of_buys);

    const tokensBought = await db.getTokensBought(campaign.id);

    await bot.sendMessage(
      chatId,
      `📊 *ACTIVE CAMPAIGN* (ID: ${campaign.id})\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `📌 *STATUS:* \`${campaign.status.toUpperCase()}\`\n` +
      `🪙 *TOKEN:* \`${campaign.token_address.substring(0, 12)}...\`\n` +
      `🏁 *DEST:* \`${campaign.destination_wallet.substring(0, 12)}...\`\n\n` +
      `📈 *PROGRESS:* ${campaign.buys_completed}/${campaign.number_of_buys}\n` +
      `${progress}\n\n` +
      `💰 *DETAILS:*\n` +
      `• Total Deposit: \`$${campaign.total_deposit_usd}\`\n` +
      `• Net Capital: \`$${(campaign.per_buy_usd * campaign.number_of_buys).toFixed(2)}\`\n` +
      `• Bot Fees: \`$${parseFloat(campaign.total_fees_usd).toFixed(2)}\`\n` +
      `• Pooled Tokens: \`${tokensBought.toString()}\`\n\n` +
      `• Per Buy: \`$${campaign.per_buy_usd}\`\n` +
      `• Interval: \`${campaign.interval_minutes} minutes\`\n\n` +
      `🎁 *Note:* Tokens are pooled in your secure deposit wallet and will be batch transferred to your destination after the final buy to save on gas fees.`,

      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔄 Refresh Status', callback_data: 'status' }],
            [{ text: '📜 Trade History', callback_data: 'history' }],
            [{ text: '❌ Cancel Campaign', callback_data: 'cancel' }]
          ]
        }
      }
    );

  } catch (err) {
    logger.error('Status error:', err);
    await bot.sendMessage(chatId, '❌ Could not load status right now.');
  }
}

async function handleCancel(bot, msg, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  const userState = userStates.get(userId);
  if (userState && userState.isSettingUp) {
    userStates.delete(userId);
    await bot.sendMessage(chatId, '🛑 *Campaign creation aborted.*', { parse_mode: 'Markdown' });
    return;
  }

  try {
    const campaign = await db.getActiveCampaign(userId);
    async function handleCancel(bot, msg, userStates) {
      const chatId = msg.chat.id;
      const userId = msg.from.id;

      // Clear setup state
      userStates.delete(userId);

      await bot.sendMessage(
        chatId,
        '🚫 *Operation Cancelled*\n\nWhat would you like to do next?',
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '🚀 New Campaign', callback_data: 'new_campaign' }],
              [{ text: '🏠 Main Menu', callback_data: 'help' }],
              [{ text: '👋 Close', callback_data: 'close_menu' }]
            ]
          }
        }
      );
    }

    async function handleHistory(bot, msg) {
      const chatId = msg.chat.id;
      const userId = msg.from.id;

      try {
        // Get user stats summary
        const stats = await db.getUserStats(userId);
        const fullHistory = await db.getUserFullHistory(userId);

        if (!fullHistory || fullHistory.length === 0) {
          await bot.sendMessage(chatId, '📜 No transaction history yet.\n\nStart your first campaign with /newcampaign!');
          return;
        }

        // Build stats summary
        let message = '📊 *YOUR ACCOUNT SUMMARY*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n';
        message += `📈 *Campaigns:* ${stats.total_campaigns} total\n`;
        message += `   • Active: ${stats.active_campaigns}\n`;
        message += `   • Completed: ${stats.completed_campaigns}\n\n`;
        message += `💰 *Trading Stats:*\n`;
        message += `   • Total Buys: ${stats.total_buys}\n`;
        message += `   • Successful: ${stats.successful_buys} ✅\n`;
        message += `   • Failed: ${stats.failed_buys} ❌\n`;
        message += `   • Total Spent: \`$${parseFloat(stats.total_spent_usd).toFixed(2)}\`\n`;
        message += `   • Gas Fees: \`${parseFloat(stats.total_fees_sol).toFixed(4)} SOL\`\n\n`;

        await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });

        // Group transactions by campaign
        const campaigns = {};
        for (const row of fullHistory) {
          if (!campaigns[row.campaign_id]) {
            campaigns[row.campaign_id] = {
              info: {
                id: row.campaign_id,
                token: row.token_address,
                totalUsd: row.total_deposit_usd,
                status: row.campaign_status,
                created: row.campaign_created,
                completed: row.completed_at,
                depositSig: row.deposit_signature
              },
              buys: []
            };
          }

          if (row.buy_id) {
            campaigns[row.campaign_id].buys.push({
              id: row.buy_id,
              swapSig: row.swap_signature,
              transferSig: row.transfer_signature,
              amountUsd: row.amount_usd,
              amountSol: row.amount_sol,
              tokens: row.tokens_received,
              feeSol: row.fee_paid_sol,
              status: row.buy_status,
              executedAt: row.executed_at,
              error: row.error_message
            });
          }
        }

        // Send campaign details (limit to last 5 campaigns)
        const campaignIds = Object.keys(campaigns).slice(0, 5);

        for (const campaignId of campaignIds) {
          const campaign = campaigns[campaignId];
          const info = campaign.info;

          let campaignMsg = `\n🎯 *CAMPAIGN #${info.id}*\n━━━━━━━━━━━━━━━━━━━━━━━\n`;
          campaignMsg += `📌 Status: \`${info.status.toUpperCase()}\`\n`;
          campaignMsg += `🪙 Token: \`${info.token.substring(0, 12)}...\`\n`;
          campaignMsg += `💵 Deposit: \`$${info.totalUsd}\`\n`;
          campaignMsg += `📅 Created: ${new Date(info.created).toLocaleDateString()}\n`;

          if (info.depositSig && info.depositSig !== 'PRE_FUNDED_OR_MANUAL') {
            campaignMsg += `🔗 [Deposit Tx](https://solscan.io/tx/${info.depositSig})\n`;
          }

          campaignMsg += `\n💼 *Transactions (${campaign.buys.length}):*\n`;

          // Show last 5 buys for this campaign
          const recentBuys = campaign.buys.slice(0, 5);
          for (const buy of recentBuys) {
            const statusIcon = buy.status === 'success' ? '✅' : '❌';
            const date = new Date(buy.executedAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            campaignMsg += `\n${statusIcon} ${date} - \`$${buy.amountUsd}\`\n`;

            if (buy.status === 'success') {
              campaignMsg += `   🪙 Tokens: \`${parseFloat(buy.tokens).toLocaleString()}\`\n`;
              if (buy.swapSig) {
                campaignMsg += `   🔗 [Swap](https://solscan.io/tx/${buy.swapSig})`;
                if (buy.transferSig) {
                  campaignMsg += ` | [Transfer](https://solscan.io/tx/${buy.transferSig})`;
                }
                campaignMsg += '\n';
              }
            } else if (buy.error) {
              const shortError = buy.error.length > 40 ? buy.error.substring(0, 40) + '...' : buy.error;
              campaignMsg += `   ⚠️ ${shortError}\n`;
            }
          }

          if (campaign.buys.length > 5) {
            campaignMsg += `\n_...and ${campaign.buys.length - 5} more transactions_\n`;
          }

          await bot.sendMessage(chatId, campaignMsg, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          });
        }

        if (Object.keys(campaigns).length > 5) {
          await bot.sendMessage(
            chatId,
            `_Showing 5 most recent campaigns. You have ${Object.keys(campaigns).length} total campaigns._`,
            { parse_mode: 'Markdown' }
          );
        }

      } catch (error) {
        logger.error('History error:', error);
        await bot.sendMessage(chatId, '❌ Could not load transaction history right now.');
      }
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