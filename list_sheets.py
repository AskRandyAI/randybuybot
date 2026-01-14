import pandas as pd
excel_path = r"c:\Users\HHeltzinger\Desktop\WaterIsLife\WaterIsLife.xlsx"
xl = pd.ExcelFile(excel_path)
print(xl.sheet_names)
