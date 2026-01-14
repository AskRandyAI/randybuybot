import pandas as pd

excel_path = r"c:\Users\HHeltzinger\Desktop\WaterIsLife\WaterIsLife.xlsx"

try:
    xl = pd.ExcelFile(excel_path)
    df = xl.parse('Package_Inventory')
    pd.set_option('display.max_columns', None)
    pd.set_option('display.width', 1000)
    print(df.head(50))
except Exception as e:
    print(f"Error: {e}")
