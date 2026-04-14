import React from 'react';
import { Download, FileSpreadsheet, Trash2, CheckCircle2, Circle } from 'lucide-react';
import { ExtractedData } from '../services/gemini';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';

interface ResultsTableProps {
  data: ExtractedData[];
  onRemove: (index: number) => void;
  onToggleTax: (index: number) => void;
  onClear: () => void;
  view?: 'summary' | 'table';
}

export function ResultsTable({ data, onRemove, onToggleTax, onClear, view = 'table' }: ResultsTableProps) {
  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(data.map(item => {
      const tax = item.taxEnabled !== false ? (item.taxAmount || 0) : 0;
      return {
        'النوع': item.type === 'invoice' ? 'فاتورة' : 'إيصال',
        'اسم المنشأة / المجال': item.entityName || item.paymentField || '-',
        'الرقم الضريبي / المرجعي': item.taxNumber || item.referenceNumber || '-',
        'التاريخ': item.date || '-',
        'المبلغ بدون ضريبة': (item.amount - tax).toFixed(2),
        'الضريبة': tax.toFixed(2),
        'المبلغ الإجمالي': item.amount.toFixed(2),
        'الموقع': item.location || '-',
        'رقم الورشة': item.workshopNumber || '-',
        'اسم الملف': item.fileName
      };
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, "extracted_data.xlsx");
  };

  const totals = data.reduce((acc, curr) => {
    const tax = curr.taxEnabled !== false ? (curr.taxAmount || 0) : 0;
    acc.total += curr.amount;
    acc.tax += tax;
    acc.subtotal += (curr.amount - tax);
    if (curr.type === 'invoice') acc.invoices++;
    else acc.receipts++;
    return acc;
  }, { total: 0, tax: 0, subtotal: 0, invoices: 0, receipts: 0 });

  if (view === 'summary') {
    return (
      <div className="space-y-4">
        <div className="card p-6 space-y-4">
          <div>
            <p className="text-[13px] text-text-muted mb-2">إجمالي المبلغ بدون ضريبة</p>
            <p className="text-2xl font-bold text-primary">{totals.subtotal.toLocaleString()} <span className="text-xs font-normal">ر.س</span></p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="text-[13px] text-text-muted mb-2">إجمالي ضريبة القيمة المضافة</p>
            <p className="text-2xl font-bold text-primary">{totals.tax.toLocaleString()} <span className="text-xs font-normal">ر.س</span></p>
          </div>
          <div className="h-px bg-border" />
          <div>
            <p className="text-[13px] text-text-muted mb-2">المبلغ الإجمالي الكلي</p>
            <p className="text-2xl font-bold text-accent">{totals.total.toLocaleString()} <span className="text-xs font-normal">ر.س</span></p>
          </div>
        </div>

        <div className="card p-4 space-y-2">
          <p className="text-xs font-bold text-text-main mb-3">إحصائيات الملفات:</p>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-muted">فواتير معالجة:</span>
            <span className="font-bold">{totals.invoices}</span>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-text-muted">إيصالات سداد:</span>
            <span className="font-bold">{totals.receipts}</span>
          </div>
        </div>

        {data.length > 0 && (
          <div className="flex flex-col gap-2">
            <button onClick={exportToExcel} className="btn btn-primary w-full flex items-center justify-center gap-2">
              <FileSpreadsheet className="w-4 h-4" />
              تصدير إلى Excel
            </button>
            <button onClick={onClear} className="btn btn-outline w-full flex items-center justify-center gap-2 text-red-600 border-red-100 hover:bg-red-50">
              <Trash2 className="w-4 h-4" />
              مسح جميع البيانات
            </button>
          </div>
        )}
      </div>
    );
  }

  if (data.length === 0) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden" dir="rtl">
      <div className="p-5 px-6 border-b border-border flex justify-between items-center shrink-0">
        <h3 className="font-bold text-text-main">البيانات المستخرجة من المستندات</h3>
        <div className="text-xs text-text-muted font-medium">
          تم استخراج {data.length} سجلات بنجاح
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="w-full text-right border-collapse">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-6 py-4 text-[13px] font-bold text-text-muted bg-[#FAFBFC] border-b border-border">اسم المنشأة / المجال</th>
              <th className="px-6 py-4 text-[13px] font-bold text-text-muted bg-[#FAFBFC] border-b border-border">الرقم الضريبي / المرجعي</th>
              <th className="px-6 py-4 text-[13px] font-bold text-text-muted bg-[#FAFBFC] border-b border-border">التاريخ</th>
              <th className="px-6 py-4 text-[13px] font-bold text-text-muted bg-[#FAFBFC] border-b border-border">القيمة</th>
              <th className="px-6 py-4 text-[13px] font-bold text-text-muted bg-[#FAFBFC] border-b border-border">الضريبة</th>
              <th className="px-6 py-4 text-[13px] font-bold text-text-muted bg-[#FAFBFC] border-b border-border">الحالة</th>
              <th className="px-6 py-4 text-[13px] font-bold text-text-muted bg-[#FAFBFC] border-b border-border"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1F3F5]">
            {data.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-[13px] text-text-main font-semibold">
                  {item.entityName || item.paymentField || '-'}
                </td>
                <td className="px-6 py-4 text-[13px] text-text-muted font-mono">
                  {item.taxNumber || item.referenceNumber || '-'}
                </td>
                <td className="px-6 py-4 text-[13px] text-text-muted">
                  {item.date || '-'}
                </td>
                <td className="px-6 py-4 text-[13px] text-text-main font-bold">
                  {item.amount.toLocaleString()} ر.س
                </td>
                <td className="px-6 py-4 text-[13px]">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleTax(idx)}
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded transition-all",
                        item.taxEnabled !== false 
                          ? "text-accent bg-emerald-50 hover:bg-emerald-100" 
                          : "text-text-muted bg-slate-100 hover:bg-slate-200"
                      )}
                      title={item.taxEnabled !== false ? "إلغاء الضريبة" : "تفعيل الضريبة"}
                    >
                      {item.taxEnabled !== false ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Circle className="w-3.5 h-3.5" />
                      )}
                      <span className="font-medium">
                        {item.taxEnabled !== false 
                          ? `${(item.taxAmount || 0).toLocaleString()} ر.س` 
                          : "بدون ضريبة"}
                      </span>
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-[4px] text-[11px] font-bold",
                    item.type === 'invoice' ? "bg-[#D1FAE5] text-[#065F46]" : "bg-[#E9ECEF] text-text-main"
                  )}>
                    {item.type === 'invoice' ? 'فاتورة' : 'إيصال'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => onRemove(idx)}
                    className="p-1.5 text-slate-300 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
