import pandas as pd
excel_path = r"c:\Users\HHeltzinger\Desktop\WaterIsLife\WaterIsLife.xlsx"
df = pd.read_excel(excel_path, sheet_name='Trait_Rarity_Master')
print(df.dropna(how='all'))
