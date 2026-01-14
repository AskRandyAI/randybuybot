import pandas as pd
excel_path = r"c:\Users\HHeltzinger\Desktop\WaterIsLife\WaterIsLife.xlsx"
xl = pd.ExcelFile(excel_path)
for sheet in xl.sheet_names:
    df = xl.parse(sheet)
    mask = df.apply(lambda row: row.astype(str).str.contains('Pond', case=False).any(), axis=1)
    if mask.any():
        print(f"Found 'Pond' in sheet '{sheet}':")
        print(df[mask].head(5))
