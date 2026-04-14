import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExtractedData {
  type: "invoice" | "receipt";
  entityName?: string;
  taxNumber?: string;
  date?: string;
  amount: number;
  taxAmount?: number;
  taxEnabled?: boolean;
  location?: string;
  workshopNumber?: string;
  referenceNumber?: string;
  paymentField?: string;
  fileName: string;
}

export async function extractDataFromFile(file: File): Promise<ExtractedData[]> {
  const base64Data = await fileToBase64(file);
  
  const prompt = `
    Extract all data from this ${file.type.includes('pdf') ? 'PDF document' : 'image'}.
    Identify if it is an invoice (فاتورة), a payment receipt (إيصال سداد / كشف حساب عملية), or a GOSI invoice (فاتورة التأمينات الاجتماعية).
    
    For Invoices (including GOSI):
    - Entity Name (اسم المنشأة): For GOSI, use "التأمينات الاجتماعية" or the facility name mentioned.
    - Tax Number (الرقم الضريبي)
    - Date (التاريخ): Use the "تاريخ إصدار الفاتورة".
    - Total Amount (المبلغ الإجمالي): Use the "مبلغ الفاتورة".
    - Tax Amount (مبلغ الضريبة)
    - Location (موقع المنشأة)
    - Invoice Number (رقم الفاتورة): Specifically for GOSI, extract the "رقم الفاتورة" at the top.
    
    Important for GOSI: Even if the document has multiple pages with details, treat it as ONE single invoice using the main invoice number and total amount.
    
    For Payment Receipts (including Bank Receipts/SADAD):
    - Reference Number (الرقم المرجعي / رقم العملية)
    - Payment Field/Service (اسم مجال سدادها / تفاصيل العملية)
    - Amount (المبلغ) - ignore negative signs if present, just extract the absolute value.
    - Date (التاريخ)
    
    Return the data as an array of objects with the following properties:
    - entityName (اسم المنشأة)
    - taxNumber (الرقم الضريبي أو رقم الفاتورة)
    - date (التاريخ)
    - amount (المبلغ الإجمالي)
    - taxAmount (مبلغ الضريبة)
    - location (الموقع)
    - referenceNumber (الرقم المرجعي)
    - paymentField (مجال السداد)
    
    Important for GOSI:
    - Map "رقم الفاتورة" to "taxNumber".
    - Map "مبلغ الفاتورة" to "amount".
    - Map "تاريخ إصدار الفاتورة" to "date".
    - Treat the whole document as ONE single object.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: file.type,
              data: base64Data,
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            type: { type: Type.STRING, enum: ["invoice", "receipt"] },
            entityName: { type: Type.STRING },
            taxNumber: { type: Type.STRING },
            date: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            taxAmount: { type: Type.NUMBER },
            location: { type: Type.STRING },
            workshopNumber: { type: Type.STRING },
            referenceNumber: { type: Type.STRING },
            paymentField: { type: Type.STRING },
          },
          required: ["type", "amount"],
        },
      },
    },
  });

  try {
    const results = JSON.parse(response.text || "[]") as ExtractedData[];
    return results.map(res => ({ ...res, fileName: file.name }));
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return [];
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}
