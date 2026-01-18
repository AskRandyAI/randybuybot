import os
import json
import pandas as pd
import random

# Configuration
PNG_DIR = r'C:\Users\HHeltzinger\Desktop\WaterIsLife\PNG_Production'
OUTPUT_DIR = r'C:\Users\HHeltzinger\Desktop\WaterIsLife\MetaData_Production'
CSV_MAP = {
    "BCH": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Beach_NFT_Combinations_Updated_Full_1188.csv',
    "DS": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Drop013_DesertSprings\DesertSprings_NFT_Combinations_1.csv',
    "FIL": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Filtration_NFT_Combinations_Updated_Full_1188.csv',
    "FL": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\FrogLake_NFT_Combinations_Updated_Full_1188.csv',
    "FP": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Drop9_FlowerPad\FlowerPad_NFT_Combinations.csv',
    "FS": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\FactorySprings_NFT_Combinations_Full_1188.csv',
    "IC": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\IceCave_NFT_Combinations_Full_1188.csv',
    "OUT": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Outfall_NFT_Combinations_Updated_Full_1188.csv',
    "RF": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Rainforest_NFT_Combinations_Updated_Full_1188.csv',
    "SF": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Drop012_SecretForest\SecretForest_NFT_Combinations.csv',
    "WB": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\WaterBear_NFT_Combinations.csv',
    "WF": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\Drop11_Waterfall\Waterfall_NFT_Combinations.csv',
    "WH": r'C:\Users\HHeltzinger\Desktop\WaterIsLife\WellHouse_NFT_Combinations_Updated_Full_1188.csv'
}

PREFIX_MAP = {
    "BCH": "Beach", "DS": "Desert Springs", "FIL": "Filtration", "OUT": "Filtration", 
    "FS": "Filtration", "RF": "Forests", "FL": "Forests", "FP": "Forests", 
    "SF": "Forests", "WF": "Forests", "IC": "Ice Cave", "WB": "Water Bear", "WH": "Well House"
}

NARRATIVES = {
    "Beach": [
        "The rhythmic cycles of the tide remind us of the resilience of coastal boundaries. This drop represents the strength found in nature's constant motion.",
        "Resilience at the water's edge. This specimen captures the delicate balance between land and sea, where life thrives despite the shifting sands.",
        "A boundary made of liquid and salt. In this environment, we witness the power of the cycle—giving, taking, and always renewing."
    ],
    "Desert Springs": [
        "In the vast silence of the arid lands, scarcity breeds persistence. This drop celebrates the emergence of life where water is the rarest treasure.",
        "A testament to persistence. Desert springs are the heartbeats of the dunes, emerging from the deep to sustain the unseen few.",
        "Where every drop is a miracle. This specimen reflects the stubborn persistence of life in the face of absolute scarcity."
    ],
    "Filtration": [
        "Engineered protection for a precious resource. This drop highlights the precision and responsibility required to guard the purity of our water.",
        "Precision in every process. The Filtration world is one of industrial responsibility, ensuring that what flows out is as pure as nature intended.",
        "Guarding the flow. This engineered landscape represents the critical responsibility we carry to protect the quality of life at its source."],
    "Forests": [
        "Renewal flows through the canopy and roots. This drop captures the motion of life cycles in the lush, green heart of our world.",
        "Life in constant motion. The forest is a masterpiece of renewal, where water fuels the endless cycle of growth and rejuvenation.",
        "From the waterfall's mist to the deepest roots, this environment thrives on the motion of life. A true celebration of natural renewal."
    ],
    "Ice Cave": [
        "Frozen in time, these crystalline structures speak of preservation and fragility. A drop that honors the slow, cold heart of the water cycle.",
        "A cathedral of preservation. In the absolute cold, beauty is found in fragility and the silent passage of time.",
        "Preserving the past to feed the future. This ice-bound specimen reminds us that even the most fragile structures can endure through time."
    ],
    "Water Bear": [
        "Microscopic guardians of the unseen world. This drop honors the endurance and strength of life that persists beyond our normal vision.",
        "Endurance in the invisible world. The Water Bear reminds us that unseen strength is often the most powerful force in nature.",
        "Microscopic strength, monumental endurance. This specimen celebrates the tiny guardians who keep the foundations of life secure."
    ],
    "Well House": [
        "Containment and protection. The Well House is a symbol of reliability, shielding the source that keeps the community thriving.",
        "Reliability starts here. Built for protection and containment, this environment ensures that the gift of water is always ready and safe.",
        "The silent protector. In the shade of the Well House, reliability meets containment, keeping our most vital resource secure."
    ]
}

RANDY_QUOTES = [
    "Randy says: Keep it green, keep it clean!",
    "Randy notes: This water is so clear, I can see my own tail in the reflection!",
    "Randy says: Remember, clean water is the best gift we can give the future!",
    "Randy observes: Even the smallest drop has a story to tell!",
    "Randy reminds us: Hydration is the key to a happy raccoon life!",
    "Randy says: I've checked the stats, and this batch is looking top-tier!",
    "Randy whispers: The echo in these caves is great for practicing my theme song!",
    "Randy says: Don't forget to protect the source. It's the only one we've got!",
    "Randy notes: A clean environment makes for a very happy (and sparkly) raccoon!",
    "Randy says: Water is life, and life is better when we're all looking out for one another!"
]

# Random Water Stats Pool
WATER_TYPES = [
    "Glacial Spring", "Natural Filtration", "Deep Aquifer", "Recycled Stream", 
    "Artesian Well", "Rainwater Harvest", "Cloud Condensate", "Mineral Pocket",
    "Purified Flow", "Eco-Reclaimed"
]

def get_random_water_stats():
    ph = round(random.uniform(6.8, 8.2), 1)
    do = round(random.uniform(7.0, 11.5), 1)
    source = random.choice(WATER_TYPES)
    return [
        {"trait_type": "pH Level", "value": str(ph)},
        {"trait_type": "Dissolved Oxygen", "value": f"{do} mg/L"},
        {"trait_type": "Water Source", "value": source}
    ]

def generate_description(prefix):
    env = PREFIX_MAP.get(prefix, "Forests")
    narrative = random.choice(NARRATIVES.get(env, NARRATIVES["Forests"]))
    quote = random.choice(RANDY_QUOTES)
    return f"{narrative} {quote}"

def get_trait_type(key):
    if "Accessory" in key:
        return "Gear"
    if "Base" in key:
        return "Environment"
    return key.replace("_", " ")

# Prepare Output
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Process Files
png_files = sorted([f for f in os.listdir(PNG_DIR) if f.endswith('.png')])
total_files = len(png_files)

# Cache CSV data to avoid repeated reads
csv_data = {}
for prefix, path in CSV_MAP.items():
    if os.path.exists(path):
        try:
            csv_data[prefix] = pd.read_csv(path)
            csv_data[prefix].set_index('NFT_Number', inplace=True)
        except Exception as e:
            print(f"Error loading {path}: {e}")

metadata_list = []

for i, filename in enumerate(png_files):
    nft_id = filename.replace('.png', '')
    prefix = nft_id.split('_')[0]
    edition_num = i + 1
    
    # Global Name - Changed to Drop-XXXX
    name = f"Water Is Life - Drop-{str(edition_num).zfill(4)}"
    
    # Description
    description = generate_description(prefix)
    
    # Attributes
    attributes = [
        {"trait_type": "Water ID", "value": nft_id},
        {"trait_type": "Zone", "value": PREFIX_MAP.get(prefix, "Nature")}
    ]
    
    # Inject Random Water Stats
    attributes.extend(get_random_water_stats())
    
    # 1 of 1 Logic
    if edition_num in [1189, 1190]:
        attributes.append({"trait_type": "Status", "value": "1 of 1"})
    
    # Trait mapping from CSV
    if i < total_files: # Safety check
        if prefix in csv_data and nft_id in csv_data[prefix].index:
            row = csv_data[prefix].loc[nft_id]
            for col in csv_data[prefix].columns:
                val = row[col]
                if val and str(val).lower() != 'none' and not pd.isna(val):
                    # Branding
                    if str(val).lower() == 'coins':
                        val = "RandyCoin"
                    if str(val).lower() == 'randy':
                        val = "Randy the Raccoon (AI)"
                    if str(val).lower() == 'dog':
                        val = "Wild Companion"
                    
                    # Attribute Type Rename
                    t_type = get_trait_type(col)
                    
                    # Special Case: rename "Environment" from get_trait_type if we already have a Zone
                    if t_type == "Environment":
                        # If it's from "Base_Variation", we already call it Environment
                        pass
                    
                    attributes.append({"trait_type": t_type, "value": val})
    
    # Build JSON
    meta = {
        "name": name,
        "description": description,
        "image": f"/{filename}",
        "edition": edition_num,
        "attributes": attributes,
        "symbol": prefix
    }
    
    # Save JSON - Using edition_num for filenames (1, 2, 3...) for simplicity on some platforms
    with open(os.path.join(OUTPUT_DIR, f"{edition_num}.json"), 'w') as f:
        json.dump(meta, f, indent=2)

print(f"Generated {total_files} metadata files in {OUTPUT_DIR}")
