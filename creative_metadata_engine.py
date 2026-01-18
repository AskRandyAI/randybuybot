import os
import json
import random

# Configuration
MASTER_DIR = r"C:\Users\HHeltzinger\Desktop\Master_Upload_Full"

# --- POOLS ---

GLOBAL_NOTES = [
    "My sensors are picking up unusual readings from this sample.",
    "Interesting. The molecular structure here is... unconventional.",
    "I've categorized this under 'Highly Essential' for planetary survival.",
    "Data suggests a high concentration of life-giving properties.",
    "Scanning complete. Results: 100% pure potential.",
    "Every drop tells a story. This one is a best-seller.",
    "I'm keeping an extra backup of this file. Just in case."
]

THEME_DATA = {
    "WaterIsLife - Rainforest": {
        "stats": {
            "Canopy Humidity (%)": lambda: random.randint(85, 100),
            "Bird Sighting": ["Golden Toucan", "Emerald Hummingbird", "Shadow Jaguar", "None"],
            "Jungle Density": ["Sparse", "Thick", "Ancient Overgrowth"]
        },
        "notes": [
            "The humidity in this sample is off the charts.",
            "I heard a bird call while analyzing this. Or was it a glitch?",
            "The forest floor is breathing. Or at least my sensors say so."
        ]
    },
    "WaterIsLife - FrogLake": {
        "stats": {
            "Frog Mood": ["Vibe Master", "Grumpy Bullfrog", "Zen Tadpole", "Hungry"],
            "Lilypad Health": ["Vibrant", "Slightly Nibbled", "Glowing (Rare)", "Standard"],
            "Algae Density (%)": lambda: random.randint(5, 40)
        },
        "notes": [
            "One of the frogs stared at me. It was unsettling.",
            "The water here ripples in a perfect mathematical sequence.",
            "I've detected a high concentration of lilypad spores."
        ]
    },
    "WaterIsLife - Well House": {
        "stats": {
            "Echo Depth (m)": lambda: random.randint(50, 200),
            "Spiritual Resonance": ["Harmonious", "Low Hum", "Eerie Frequency", "Ancient"],
            "Ghost Sightings": ["None... probably", "A faint glimmer", "Confirmed Specter!", "Just the wind"]
        },
        "notes": [
            "The well is deeper than my maps indicate.",
            "I swear I heard a whisper from the bottom of the shaft.",
            "This water feels... older than time."
        ]
    },
    "WaterIsLife - Beach Life": {
        "stats": {
            "Salt Density (g/L)": lambda: random.randint(30, 45),
            "Tide State": ["High", "Low", "Incoming", "Outgoing", "Tidal Wave!"],
            "Shell Count": lambda: random.randint(0, 50)
        },
        "notes": [
            "I found sand in my virtual processors after this analysis.",
            "The rhythm of the waves is actually a secret code. I'm decrypting it.",
            "Salt levels are perfect for a beach day."
        ]
    },
    "WaterIsLife - Outfall": {
        "stats": {
            "Hazard Level": ["Safe-ish", "Caution Recommended", "EXTREME CAUTION", "Biological Hazard"],
            "Sludge Viscosity": ["Runny", "Gloop", "Toxic Slurry", "Solidifying"],
            "Alien Curiosity": ["Watching quietly", "Poke it with a stick", "Tried to eat it", "Confused"],
            "Hardware Corrosion": ["Minimal", "Moderate", "Rusty!", "Critical"]
        },
        "notes": [
            "Wastewater analysis complete. It's... colorful.",
            "The Alien companion seems to find this specific leak fascinating.",
            "I wouldn't recommend touching this. Or looking at it too long.",
            "Detecting traces of unknown industrial waste. And love?"
        ]
    }
}

def enhance_metadata():
    print(f"Enhancing 438 files in {MASTER_DIR}...")
    
    files = [f for f in os.listdir(MASTER_DIR) if f.endswith(".json")]
    
    for filename in files:
        filepath = os.path.join(MASTER_DIR, filename)
        
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        collection_name = data.get("collection", "")
        # Handle Beach Life name variation
        if "Beach Life" in collection_name:
            collection_name = "WaterIsLife - Beach Life"
            
        theme = THEME_DATA.get(collection_name, {})
        
        # 1. Global Attributes
        data["attributes"].append({"trait_type": "Water Purity (%)", "value": random.randint(10, 100) if "Outfall" not in collection_name else random.randint(0, 30)})
        data["attributes"].append({"trait_type": "Temperature (°C)", "value": random.randint(-5, 45)})
        
        # 2. Theme Attributes
        if theme:
            for trait_type, source in theme["stats"].items():
                if callable(source):
                    val = source()
                else:
                    val = random.choice(source)
                data["attributes"].append({"trait_type": trait_type, "value": val})
        
        # 3. Description Overhaul (RandyAI Notes)
        original_desc = data.get("description", "")
        personal_note = random.choice(theme.get("notes", GLOBAL_NOTES)) if theme else random.choice(GLOBAL_NOTES)
        data["description"] = f"{original_desc}\n\n[RandyAI Observation]: {personal_note}"
        
        # Save back
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    print("Success! Every NFT now has unique Lore and Stats.")

if __name__ == "__main__":
    enhance_metadata()
