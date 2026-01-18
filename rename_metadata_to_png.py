import os

# Configuration
PNG_DIR = r'C:\Users\HHeltzinger\Desktop\WaterIsLife\PNG_Production'
JSON_DIR = r'C:\Users\HHeltzinger\Desktop\WaterIsLife\MetaData_Production'

def rename_metadata():
    if not os.path.exists(PNG_DIR) or not os.path.exists(JSON_DIR):
        print("Error: Directories not found.")
        return

    # Get sorted list of PNGs to ensure mapping matches the generation order
    png_files = sorted([f for f in os.listdir(PNG_DIR) if f.endswith('.png')])
    
    print(f"Found {len(png_files)} PNG files. Starting renaming...")

    renamed_count = 0
    for i, png_filename in enumerate(png_files):
        edition_num = i + 1
        old_json_name = f"{edition_num}.json"
        new_json_name = png_filename.replace('.png', '.json')
        
        old_path = os.path.join(JSON_DIR, old_json_name)
        new_path = os.path.join(JSON_DIR, new_json_name)
        
        if os.path.exists(old_path):
            try:
                os.rename(old_path, new_path)
                renamed_count += 1
            except Exception as e:
                print(f"Error renaming {old_json_name} to {new_json_name}: {e}")
        else:
            # Check if it was already renamed (optional)
            if not os.path.exists(new_path):
                print(f"Warning: {old_json_name} not found.")

    print(f"Successfully renamed {renamed_count} metadata files in {JSON_DIR}")

if __name__ == "__main__":
    rename_metadata()
