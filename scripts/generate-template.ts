import ExcelJS from "exceljs";

async function generateTemplate() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Transactions");

  sheet.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Ticker", key: "ticker", width: 12 },
    { header: "Action", key: "action", width: 12 },
    { header: "Quantity", key: "quantity", width: 12 },
    { header: "Gross Amount", key: "grossAmount", width: 16 },
    { header: "Fees", key: "fees", width: 10 },
    { header: "Portfolio", key: "portfolio", width: 22 },
    { header: "Currency", key: "currency", width: 10 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF4F4F5" },
  };

  // Data validation for Action column (rows 2-1000)
  for (let row = 2; row <= 1000; row++) {
    sheet.getCell(`C${row}`).dataValidation = {
      type: "list",
      formulae: ['"buy,sell,dividend,fee"'],
      showErrorMessage: true,
      errorTitle: "Invalid Action",
      error: "Must be buy, sell, dividend, or fee",
    };
  }

  // Freeze header row
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  await workbook.xlsx.writeFile("public/template.xlsx");
  console.log("Template generated: public/template.xlsx");
}

generateTemplate();
