import { useState, useEffect } from 'react';
import { FileUpload } from './components/FileUpload';
import { ResultsTable } from './components/ResultsTable';
import { extractDataFromFile, ExtractedData } from './services/gemini';
import { FileText, History, Cloud, CloudOff } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function App() {
  const [data, setData] = useState<ExtractedData[]>(() => {
    const saved = localStorage.getItem('extracted_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved data", e);
        return [];
      }
    }
    return [];
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load data from Supabase on mount
  useEffect(() => {
    const loadSupabaseData = async () => {
      if (!supabase) return;
      
      try {
        const { data: supabaseData, error } = await supabase
          .from('extracted_invoices')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        if (supabaseData && supabaseData.length > 0) {
          // Merge with local data or replace? 
          // For now, let's replace local with cloud if cloud has data
          setData(supabaseData);
        }
      } catch (err) {
        console.error('Error loading from Supabase:', err);
      }
    };

    loadSupabaseData();
  }, []);

  // Sync to local storage and Supabase
  useEffect(() => {
    localStorage.setItem('extracted_data', JSON.stringify(data));
    
    const syncToSupabase = async () => {
      if (!supabase || data.length === 0) return;
      
      setIsSyncing(true);
      try {
        // Simple sync strategy: delete all and re-insert (for small datasets)
        // In a real app, you'd use upsert or incremental sync
        const { error: deleteError } = await supabase
          .from('extracted_invoices')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (deleteError) throw deleteError;

        const { error: insertError } = await supabase
          .from('extracted_invoices')
          .insert(data.map(item => ({
            entity_name: item.entityName,
            tax_number: item.taxNumber,
            date: item.date,
            amount: item.amount,
            tax_amount: item.taxAmount,
            tax_enabled: item.taxEnabled,
            location: item.location,
            reference_number: item.referenceNumber,
            payment_field: item.paymentField
          })));

        if (insertError) throw insertError;
      } catch (err) {
        console.error('Error syncing to Supabase:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    const timeoutId = setTimeout(syncToSupabase, 2000); // Debounce sync
    return () => clearTimeout(timeoutId);
  }, [data]);

  const handleFilesSelected = async (files: File[]) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      const allResults: ExtractedData[] = [];
      let duplicateCount = 0;

      for (const file of files) {
        const results = await extractDataFromFile(file);
        
        // Initialize taxEnabled and calculate tax if needed
        const processedResults = results.map(res => {
          const utilityKeywords = ["كهرباء", "ماء", "مياه", "اتصالات", "هاتف", "جوال", "stc", "mobily", "zain", "nwc", "المياه الوطنية", "السعودية للطاقة", "saudi electricity", "booking", "بوكينج"];
          const fieldToSearch = (res.paymentField || res.entityName || "").toLowerCase();
          const isUtility = utilityKeywords.some(kw => fieldToSearch.includes(kw));
          
          let taxEnabled = res.taxAmount ? res.taxAmount > 0 : false;
          let taxAmount = res.taxAmount;

          if (isUtility) {
            taxEnabled = true;
            if (!taxAmount || taxAmount === 0) {
              taxAmount = Number((res.amount * 0.15 / 1.15).toFixed(2));
            }
          }

          return {
            ...res,
            taxEnabled,
            taxAmount
          };
        });

        // Filter duplicates
        for (const newItem of processedResults) {
          const normalize = (s?: string) => s?.trim().toLowerCase() || "";
          
          const newItemNum = normalize(newItem.taxNumber || newItem.referenceNumber);
          const newItemDate = normalize(newItem.date);
          const newItemAmount = newItem.amount;

          const isDuplicate = data.some(existingItem => {
            const existingNum = normalize(existingItem.taxNumber || existingItem.referenceNumber);
            const existingDate = normalize(existingItem.date);
            return existingNum === newItemNum && 
                   existingDate === newItemDate && 
                   existingItem.amount === newItemAmount;
          }) || allResults.some(addedItem => {
            const addedNum = normalize(addedItem.taxNumber || addedItem.referenceNumber);
            const addedDate = normalize(addedItem.date);
            return addedNum === newItemNum && 
                   addedDate === newItemDate && 
                   addedItem.amount === newItemAmount;
          });

          if (isDuplicate) {
            duplicateCount++;
          } else {
            allResults.push(newItem);
          }
        }
      }

      if (duplicateCount > 0) {
        setError(`تم تجاهل ${duplicateCount} مستندات مكررة (تطابق في الاسم والرقم والتاريخ والقيمة).`);
      }
      
      setData(prev => [...prev, ...allResults]);
    } catch (err) {
      console.error(err);
      setError("حدث خطأ أثناء معالجة الملفات. يرجى المحاولة مرة أخرى.");
    } finally {
      setIsProcessing(false);
    }
  };

  const removeRow = (index: number) => {
    setData(prev => prev.filter((_, i) => i !== index));
  };

  const toggleTax = (index: number) => {
    setData(prev => prev.map((item, i) => {
      if (i === index) {
        const isEnabled = item.taxEnabled !== false;
        const newEnabled = !isEnabled;
        
        // If enabling and taxAmount is missing/zero, calculate 15% VAT (inclusive)
        let newTaxAmount = item.taxAmount;
        if (newEnabled && (!newTaxAmount || newTaxAmount === 0)) {
          newTaxAmount = Number((item.amount * 0.15 / 1.15).toFixed(2));
        }
        
        return { ...item, taxEnabled: newEnabled, taxAmount: newTaxAmount };
      }
      return item;
    }));
  };

  const clearAll = async () => {
    setData([]);
    if (supabase) {
      try {
        await supabase.from('extracted_invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      } catch (err) {
        console.error('Error clearing Supabase:', err);
      }
    }
  };

  return (
    <div className="h-screen flex flex-col bg-bg" dir="rtl">
      {/* Header */}
      <header className="h-[70px] bg-card border-b-2 border-border flex items-center justify-between px-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 bg-primary rounded-sm" />
          <h1 className="text-xl font-bold text-text-main tracking-tight">نظام استخراج البيانات الذكي</h1>
        </div>
        
        <div className="flex gap-3">
          <div className="hidden sm:flex items-center gap-4 text-text-muted ml-6">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              <span className="text-xs font-semibold">PDF & الصور</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-2">
              <History className="w-4 h-4" />
              <span className="text-xs font-semibold">تصدير Excel</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-[280px_1fr] gap-6 p-6 lg:px-10 overflow-hidden">
        {/* Sidebar */}
        <aside className="flex flex-col gap-5 overflow-y-auto">
          <FileUpload onFilesSelected={handleFilesSelected} isProcessing={isProcessing} />
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 text-red-600 rounded-lg text-xs font-medium text-center">
              {error}
            </div>
          )}

          <ResultsTable 
            data={data} 
            onRemove={removeRow} 
            onToggleTax={toggleTax}
            onClear={clearAll}
            view="summary"
          />
        </aside>

        {/* Content Area */}
        <section className="card flex flex-col overflow-hidden">
          <ResultsTable 
            data={data} 
            onRemove={removeRow} 
            onToggleTax={toggleTax}
            onClear={clearAll}
            view="table"
          />
          
          {data.length === 0 && !isProcessing && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-12 space-y-4">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center">
                <FileText className="w-8 h-8" />
              </div>
              <div className="max-w-xs">
                <h3 className="text-lg font-bold text-text-main">لا توجد بيانات مستخرجة</h3>
                <p className="text-sm text-text-muted leading-relaxed">
                  ارفع ملفات PDF أو صور الفواتير والإيصالات في المنطقة الجانبية للبدء.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="h-[60px] bg-card border-t border-border flex items-center justify-between px-10 shrink-0 text-xs text-text-muted">
        <div className="flex gap-5 items-center">
          <div className="flex items-center gap-2">
            {supabase ? (
              <>
                <Cloud className={`w-4 h-4 ${isSyncing ? 'text-blue-500 animate-pulse' : 'text-green-500'}`} />
                <span>{isSyncing ? 'جاري المزامنة مع السحابة...' : 'متصل بـ Supabase'}</span>
              </>
            ) : (
              <>
                <CloudOff className="w-4 h-4 text-amber-500" />
                <span>وضع الحفظ المحلي (Supabase غير مهيأ)</span>
              </>
            )}
          </div>
          <div className="h-4 w-px bg-border" />
          <span>آخر تحديث: {new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div>
          تم استخراج بيانات {data.length} مستندات من الملفات المرفوعة
        </div>
      </footer>
    </div>
  );
}
