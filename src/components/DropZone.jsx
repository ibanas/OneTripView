import { useRef, useState } from 'react';
import { UploadIcon } from './icons.jsx';

function pickPdfs(fileList) {
  return [...fileList].filter(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  );
}

export default function DropZone({ onFiles, compact = false }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const pdfs = pickPdfs(e.dataTransfer.files);
    if (pdfs.length) onFiles(pdfs);
  };

  const handleSelect = (e) => {
    const pdfs = pickPdfs(e.target.files);
    if (pdfs.length) onFiles(pdfs);
    e.target.value = ''; // allow re-selecting the same file
  };

  const open = () => inputRef.current?.click();

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={open}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && open()}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors ${
        dragging
          ? 'border-sky-400 bg-sky-50'
          : 'border-slate-300 bg-white/60 hover:border-sky-300 hover:bg-sky-50/40'
      } ${compact ? 'gap-1 p-4' : 'gap-3 p-10'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        onChange={handleSelect}
        className="hidden"
      />
      <div
        className={`flex items-center justify-center rounded-full bg-sky-100 text-sky-600 ${
          compact ? 'h-9 w-9' : 'h-14 w-14'
        }`}
      >
        <UploadIcon className={compact ? 'w-4 h-4' : 'w-6 h-6'} />
      </div>
      <div>
        <p className={`font-semibold text-ink ${compact ? 'text-sm' : 'text-lg'}`}>
          {dragging ? 'Drop to add bookings' : 'Drop booking PDFs here'}
        </p>
        {!compact && (
          <p className="mt-1 text-sm text-slate-500">
            Flights, hotels, Airbnbs — or{' '}
            <span className="font-medium text-sky-600">browse files</span>. Multiple at
            once is fine.
          </p>
        )}
      </div>
    </div>
  );
}
