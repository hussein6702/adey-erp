"use client";

import Image from "next/image";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

/**
 * PrintLayout - Reusable print wrapper component
 */
export function PrintLayout({ title, docNumber, date, children, showOnScreen = false }) {
  const displayDate = date ? format(new Date(date), "dd-MM-yyyy") : format(new Date(), "dd-MM-yyyy");

  return (
    <div className={showOnScreen ? "block" : "print-only"}>
      <div className="print-layout max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="print-header flex items-center border-b-2 border-gray-800 pb-3 mb-6">
          <div className="flex items-center gap-3">
            <img src="/brownLogo.svg" alt="Adey" width={48} height={48} />
            <h1 className="text-xl font-bold text-gray-900">Adey Chocolatier</h1>
          </div>
        </div>

        {/* Content */}
        <div className="print-content">
          {children}
        </div>

        {/* Footer */}
        <div className="print-footer mt-8 pt-3 border-t border-gray-300 text-center text-xs text-gray-400">
          <p>Adey Chocolatier · Generated on {format(new Date(), "dd-MM-yyyy HH:mm")}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * PrintableDocument - On-screen preview that is print-ready
 */
export function PrintablePreview({ title, docNumber, date, children }) {
  // The Adey logo SVG path data - embedded for reliable PDF rendering
  const LOGO_SVG_PATH = "M143.88,134.59l-44.09-.05v-12.7s44.1.05,44.1.05v-9.43s-44.08-.05-44.08-.05v-12.2s44.1.05,44.1.05l.05-55.06-44.09-.05v-12.56s44.1.05,44.1.05v-9.43s-44.08-.05-44.08-.05v-12.65s44.1.05,44.1.05V1.15s-55.08-.05-55.08-.05c-.01,14.8-.03,29.58-.04,44.37h-12.17S76.75,0,76.75,0h-9.42s-.05,45.45-.05,45.45l-12.13-.02.05-44.37L.14,1.02v9.43s44.08.05,44.08.05v12.65s-44.12-.05-44.12-.05v9.41s44.09.05,44.09.05v12.56s-44.1-.04-44.1-.04l-.05,55.06h9.42s34.67.04,34.67.04v12.2s-44.1-.05-44.1-.05v9.43s44.08.05,44.08.05v12.7S0,134.45,0,134.45v9.43s55.08.05,55.08.05c.01-14.87.03-29.74.04-44.6h12.13s-.04,44.61-.04,44.61h9.42s.04-44.6.04-44.6h12.18c-.01,14.88-.03,29.75-.04,44.61l55.09.05v-9.43s-.02.01-.02.01ZM9.47,89.72l.04-34.23,13.4.02-.04,34.23s-13.4-.02-13.4-.02ZM32.29,89.74l.04-34.23h11.84s-.04,34.23-.04,34.23l-11.84-.02h0ZM55.16,55.84c11.46,0,22.26.02,33.73.02v11.94s-33.74-.04-33.74-.04v-11.94s0,.01,0,.01ZM55.12,89.89v-12.7s33.74.04,33.74.04v12.7s-33.74-.04-33.74-.04ZM134.55,55.62l-.04,34.23-13.4-.02.04-34.23,13.41.02h-.01ZM99.88,55.58h11.84s-.04,34.23-.04,34.23h-11.84s.04-34.23.04-34.23Z";

  const handleDownloadPdf = async () => {
    const element = document.getElementById(`printable-${docNumber || 'doc'}`);
    if (!element) return;
    
    try {
      const html2canvas = (await import("html2canvas-pro")).default;
      const { jsPDF } = await import("jspdf");

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        windowWidth: 794,
        onclone: (clonedDoc) => {
          // Find the cloned element by ID (reliable across all versions)
          const el = clonedDoc.getElementById(`printable-${docNumber || 'doc'}`);
          if (!el) return;

          // 1. Strip document-level styles only (preserves SVG internal styles)
          Array.from(clonedDoc.head.querySelectorAll('style, link[rel="stylesheet"]')).forEach(s => s.remove());

          // 2. Force element to render at full A4 width
          el.style.width = '794px';
          el.style.minWidth = '794px';
          el.style.maxWidth = '794px';
          el.style.padding = '40px';
          el.style.margin = '0';
          el.style.backgroundColor = '#fff';
          el.style.boxShadow = 'none';
          el.style.border = 'none';

          // 3. Replace SVG img with inline SVG for reliable rendering
          const svgImgs = el.querySelectorAll('img[src$=".svg"]');
          svgImgs.forEach(img => {
            const svg = clonedDoc.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.setAttribute('viewBox', '0 0 144 144');
            svg.setAttribute('width', '48');
            svg.setAttribute('height', '48');
            const path = clonedDoc.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('fill', '#000');
            path.setAttribute('d', LOGO_SVG_PATH);
            svg.appendChild(path);
            img.parentNode.replaceChild(svg, img);
          });

          // 4. Neutralize oklch/lab colors on all elements
          el.querySelectorAll('*').forEach(node => {
            const s = node.style;
            if (s.color && /oklch|lab|lch|oklab/i.test(s.color)) s.color = '#000';
            if (s.backgroundColor && /oklch|lab|lch|oklab/i.test(s.backgroundColor)) s.backgroundColor = '#fff';
            if (s.borderColor && /oklch|lab|lch|oklab/i.test(s.borderColor)) s.borderColor = '#ccc';
          });

          // 5. Inject clean print stylesheet — NO global background wipe
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            [id^="printable-"] { background: #fff !important; }
            [id^="printable-"] * {
              color: #000 !important;
              box-shadow: none !important;
              text-shadow: none !important;
              font-family: sans-serif !important;
            }
            table { width: 100%; border-collapse: collapse; margin-block: 10px; }
            th, td { border: 1px solid #000 !important; padding: 8px; text-align: left; font-size: 12px; background: #fff !important; }
            th { background: #f5f5f5 !important; font-weight: bold; }
            h1, h2, h3, h4 { margin: 0 0 10px 0; }
          `;
          clonedDoc.head.appendChild(style);
        }
      });

      // Convert canvas to PDF
      const imgData = canvas.toDataURL('image/jpeg', 0.98);
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pdfWidth - margin * 2;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;
      const pageContentHeight = pdfHeight - margin * 2;

      if (imgHeight <= pageContentHeight) {
        pdf.addImage(imgData, 'JPEG', margin, margin, contentWidth, imgHeight);
      } else {
        const pageCanvasHeight = Math.floor(canvas.height * (pageContentHeight / imgHeight));
        const totalPages = Math.ceil(canvas.height / pageCanvasHeight);
        
        for (let page = 0; page < totalPages; page++) {
          if (page > 0) pdf.addPage();
          const srcY = page * pageCanvasHeight;
          const srcH = Math.min(pageCanvasHeight, canvas.height - srcY);
          const destH = (srcH / canvas.width) * contentWidth;
          
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = srcH;
          const ctx = pageCanvas.getContext('2d');
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
          
          pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.98), 'JPEG', margin, margin, contentWidth, destH);
        }
      }

      pdf.save(`${docNumber || 'document'}.pdf`);
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("PDF Download Error: " + err.message + ". Try using the 'Print' button instead.");
    }
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm flex flex-col min-h-screen lg:min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 print:hidden sticky top-0 z-10 shadow-sm">
        <div className="flex flex-col">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Document Preview</h3>
          <p className="text-[10px] text-muted-foreground font-medium">Standard A4 Format (210mm × 297mm)</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="border-gray-300 shadow-sm hover:bg-white active:scale-95 transition-all">
            <Printer className="h-4 w-4 mr-2" /> Print
          </Button>
          <Button variant="default" size="sm" onClick={handleDownloadPdf} className="bg-black hover:bg-black/90 text-white shadow-md active:scale-95 transition-all">
            <Download className="h-4 w-4 mr-2" /> Download PDF
          </Button>
        </div>
      </div>
      <div className="p-4 md:p-8 flex-1 bg-gray-100/80 print:p-0 print:bg-white flex justify-center overflow-visible">
        <div id={`printable-${docNumber || 'doc'}`} className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)] p-[15mm] md:p-[20mm] border border-gray-200 mx-auto w-[210mm] min-h-[297mm] print:shadow-none print:border-0 print:p-0 print:m-0 flex flex-col relative">
          {/* Header */}
          <div className="flex items-center border-b-[3px] border-black pb-6 mb-8">
            <div className="flex items-center gap-4">
              <img src="/brownLogo.svg" alt="Adey" width={48} height={48} className="grayscale brightness-0" />
              <h2 className="text-2xl font-black uppercase tracking-tighter text-black">Adey Chocolatier</h2>
            </div>
          </div>

          {/* Content Wrapper - ensures children also respect B&W */}
          <div className="document-content-bw">
            {children}
          </div>

          {/* Footer */}
          <div className="mt-16 pt-6 border-t-[1px] border-gray-200 text-center">
            <p className="text-[9px] text-gray-400 uppercase tracking-widest font-medium">
              Adey Chocolatier · Generated on {format(new Date(), "dd-MM-yyyy HH:mm")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
