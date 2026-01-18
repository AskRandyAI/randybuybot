import os
import csv
import json
import random
from PIL import Image

# Configuration
BASE_PROJECT_DIR = r"C:\Users\HHeltzinger\Desktop\WaterIsLife"

CONFIG = {
    "FactorySprings": {
        "base_dir": os.path.join(BASE_PROJECT_DIR, "Drop014_FactorySprings"),
        "csv_path": os.path.join(BASE_PROJECT_DIR, r"Drop014_FactorySprings\FactorySprings_NFT_Combinations.csv"),
        "base_map": {
            "FactorySprings_1": "Drop014_Base_FactorySprings1",
            "FactorySprings_2": "Drop014_Base_FactorySprings2",
            "FactorySprings_3": "Drop014_Base_FactorySprings3",
            "FactorySprings_4": "Drop014_Base_FactorySprings4",
            "FactorySprings_5": "Drop014_Base_FactorySprings5",
            "FactorySprings_6": "Drop014_Base_FactorySprings6"
        },
        "trait_map": {
            "Anchor": "Drop014_Anchor",
            "AlgaeBlue": "Drop014_BlueOoze",
            "WarningSign": "Drop014_Caution",
            "Comet": "Drop014_Comet",
            "AlgaeGreen": "Drop014_GreenOoze",
            "HelpWanted": "Drop014_HelpWanted",
            "Dodo": "Drop014_LongNeck",
            "AlgaePurple": "Drop014_PurpleOoze",
            "Randy": "Drop014_Randy",
            "WaterBear": "Drop014_Squirrel_"
        },
        "prefix": "",
        "base_prefix": "",
        "theme": "Factory Springs"
    }
}

# Output Directories
PNG_DIR = os.path.join(BASE_PROJECT_DIR, "PNG_Production")
JSON_DIR = os.path.join(BASE_PROJECT_DIR, "MetaData_Production")

os.makedirs(PNG_DIR, exist_ok=True)
os.makedirs(JSON_DIR, exist_ok=True)

def generate_nft(env_name, row):
    cfg = CONFIG[env_name]
    nft_num = row['NFT_Number']
    base_val = row['Base_Variation'] if 'Base_Variation' in row else row['Base_Color']
    rarity = row['Final_Rarity']
    
    # 1. Resolve Base Image
    mapped_base = cfg['base_map'].get(base_val, base_val)
    base_filename = f"{mapped_base}.png"
    base_path = os.path.join(cfg['base_dir'], base_filename)
    
    if not os.path.exists(base_path):
        print(f"Error: Base file not found: {base_path}")
        return

    img = Image.open(base_path).convert("RGBA")
    
    accessories = [row.get(f'Accessory_{i}') for i in range(1, 6)] # Check up to 5 accessories
    for acc in accessories:
        if not acc or acc.lower() == 'none' or acc == '':
            continue
        
        mapped_acc = cfg['trait_map'].get(acc, acc)
        acc_filename = f"{mapped_acc}.png"
        acc_path = os.path.join(cfg['base_dir'], acc_filename)

        if os.path.exists(acc_path):
            acc_img = Image.open(acc_path).convert("RGBA")
            img.alpha_composite(acc_img)
        else:
            print(f"Warning: Accessory file not found: {acc_path}")

    # Save PNG
    output_png = os.path.join(PNG_DIR, f"{nft_num}.png")
    try:
        img.save(output_png)
    except Exception as e:
        print(f"Error saving {output_png}: {e}")

    # 3. Create Metadata (Basic version for now)
    attributes = []
    attributes.append({"trait_type": "Environment", "value": cfg['theme']})
    attributes.append({"trait_type": "Rarity", "value": rarity})
    
    for i in range(1, 6):
        acc = row.get(f'Accessory_{i}')
        if not acc or acc.lower() == 'none' or acc == '':
             continue
        mapped_acc = cfg['trait_map'].get(acc, acc)
        attributes.append({"trait_type": f"Accessory {i}", "value": acc}) # Keep original name for trait type

    metadata = {
        "name": f"WaterIsLife #{nft_num}",
        "symbol": "WIL",
        "description": f"A unique representation of the {cfg['theme']} environment.",
        "collection": {"name": f"WaterIsLife - {cfg['theme']}", "family": "WaterIsLife"},
        "attributes": attributes,
        "image": f"{nft_num}.png"
    }

    output_json = os.path.join(JSON_DIR, f"{nft_num}.json")
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=2)

def run_drop(env_name):
    cfg = CONFIG[env_name]
    print(f"--- Generating {env_name} ---")
    if not os.path.exists(cfg['csv_path']):
        print(f"Error: CSV not found at {cfg['csv_path']}")
        return
        
    with open(cfg['csv_path'], 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        count = 0
        for row in reader:
            generate_nft(env_name, row)
            count += 1
            if count % 100 == 0:
                print(f"Generated {count} NFTs...")
    print(f"Finished {count} NFTs for {env_name}.")

if __name__ == "__main__":
    run_drop("FactorySprings")
    print("\n[FACTORY SPRINGS COMPLETE]")
