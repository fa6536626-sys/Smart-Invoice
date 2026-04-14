import React, { useCallback, useState } from 'react';
import { Upload, FileText, X, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface FileUploadProps {
  onFilesSelected: (files: File[]) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFilesSelected, isProcessing }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      (file: File) => file.type === 'application/pdf' || file.type.startsWith('image/')
    ) as File[];
    if (files.length > 0) {
      onFilesSelected(files);
    }
  }, [onFilesSelected]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(
        (file: File) => file.type === 'application/pdf' || file.type.startsWith('image/')
      ) as File[];
      if (files.length > 0) {
        onFilesSelected(files);
      }
    }
  }, [onFilesSelected]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={cn(
        "relative group cursor-pointer border-2 border-dashed rounded-lg p-6 transition-all duration-300 ease-in-out flex flex-col items-center justify-center gap-3",
        isDragging ? "border-primary bg-blue-50/50" : "border-border bg-[#F8F9FA] hover:border-slate-400",
        isProcessing && "opacity-50 pointer-events-none"
      )}
    >
      <input
        type="file"
        multiple
        accept="application/pdf,image/*"
        onChange={handleFileInput}
        className="absolute inset-0 opacity-0 cursor-pointer"
        disabled={isProcessing}
      />
      
      <div className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center transition-transform duration-300",
        isDragging ? "bg-blue-100 text-primary scale-110" : "bg-white text-text-muted group-hover:scale-110 shadow-sm"
      )}>
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Upload className="w-5 h-5" />
        )}
      </div>

      <div className="text-center">
        <p className="text-sm font-bold text-text-main">
          {isProcessing ? "جاري معالجة الملفات..." : "اسحب وأفلت الفواتير هنا"}
        </p>
        <p className="text-[11px] text-text-muted mt-1 font-medium">
          PDF أو صور (PNG, JPG)
        </p>
      </div>
    </div>
  );
}
