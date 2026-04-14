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
    Identify if it is an invoice (فاتورة) or a payment receipt (إيصال سداد / كشف حساب عملية).
    
    For Invoices, extract:
    - Entity Name (اسم المنشأة)
    - Tax Number (الرقم الضريبي)
    - Date (التاريخ)
    - Total Amount (المبلغ الإجمالي)
    - Tax Amount (مبلغ الضريبة)
    - Location (موقع المنشأة)
    - Workshop Number (رقم الورشة) if available.
    
    For Payment Receipts (including Bank Receipts/SADAD), extract:
    - Reference Number (الرقم المرجعي / رقم العملية)
    - Payment Field/Service (اسم مجال سدادها / تفاصيل العملية)
    - Amount (المبلغ) - ignore negative signs if present, just extract the absolute value.
    - Date (التاريخ)
    
    Return the data as an array of objects. If a PDF has multiple receipts/invoices on different pages, return them all.
    Ensure amounts are numbers.
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
