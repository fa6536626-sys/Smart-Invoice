import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ExtractedData {
  id?: string;
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
    Analyze the provided ${file.type.includes('pdf') ? 'PDF' : 'image'} with high precision OCR.
    The document is in Arabic/English. Extract financial data accurately.
    
    Classification:
    1. Invoice (فاتورة): Standard commercial invoice.
    2. GOSI Invoice (فاتورة التأمينات الاجتماعية): Treat as ONE invoice. Use "رقم الفاتورة" as taxNumber, "مبلغ الفاتورة" as amount, and facility name as entityName.
    3. Payment Receipt (إيصال سداد): Bank transfer, SADAD, or POS receipt.
    
    Fields to Extract:
    - type: "invoice" or "receipt".
    - entityName: Name of the company/entity.
    - taxNumber: VAT number or Invoice number.
    - date: Transaction/Invoice date.
    - amount: Total amount (Gross).
    - taxAmount: VAT amount if explicitly mentioned.
    - location: City or branch.
    - referenceNumber: For receipts, the transaction ID.
    - paymentField: For receipts, format as follows:
        * If SADAD/Bank Statement: "التفاصيل: مدفوعات سداد - [Service Name]"
        * If Transfer Receipt: "إلى (المستفيد): [Beneficiary Name]"
        * If Bill/Utility (Electricity, Water, ZATCA, etc.): "اسم المفوتر: [Biller Name]"
    
    Constraint:
    - If GOSI: Return exactly ONE object for the entire document.
    - Return JSON array.
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
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
