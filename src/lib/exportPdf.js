import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { groupByDate, summarize, TYPE_LABELS } from './bookings.js';
import { typeStyle } from './typeStyles.js';
import { resolveTravelers } from './people.js';
import { formatDateHeading, formatRange, formatDateShort } from './format.js';

function hexToRgb(hex) {
  const m = hex.replace('#', '');
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

const INK = [31, 41, 51];
const MUTED = [110, 119, 129];
const BAND = [37, 99, 235]; // sky-600

/** Clean, printable, day-grouped itinerary with a colored cover band. */
export function exportToPdf(bookings, resolver) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  const summary = summarize(bookings, resolver);

  const travelerNames = (b) =>
    resolver ? resolveTravelers(b.travelers, resolver).map((c) => c.name) : b.travelers;

  // ---- Cover band ----
  doc.setFillColor(...BAND);
  doc.rect(0, 0, pageWidth, 96, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text('Travel Itinerary', margin, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const range = formatRange(summary.tripStart, summary.tripEnd);
  const stats = [
    range,
    `${summary.flights} flight${summary.flights === 1 ? '' : 's'}`,
    `${summary.stays} stay${summary.stays === 1 ? '' : 's'}`,
    `${summary.nights} night${summary.nights === 1 ? '' : 's'}`,
  ]
    .filter(Boolean)
    .join('   •   ');
  doc.text(stats, margin, 66);

  // Travelers line (canonical, de-duped) below the band.
  let cursorY = 118;
  if (summary.people.length) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(10);
    const text = `Travelers:  ${summary.people.map((p) => p.name).join('  ·  ')}`;
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2);
    doc.text(wrapped, margin, cursorY);
    cursorY += wrapped.length * 13 + 8;
  }

  // ---- Day sections ----
  const groups = groupByDate(bookings);

  for (const group of groups) {
    // Keep a day heading with at least the start of its table on the same page.
    if (cursorY > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      cursorY = 54;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(group.date ? formatDateHeading(group.date) : 'No date', margin, cursorY);
    doc.setDrawColor(...BAND);
    doc.setLineWidth(1.5);
    doc.line(margin, cursorY + 4, margin + 34, cursorY + 4);

    const body = group.items.map((b) => {
      const sameDay = !b.endDate || b.endDate === b.startDate;
      const when = [
        b.startTime || '',
        b.endTime ? `→ ${b.endTime}` : '',
        !sameDay && b.endDate ? `(${formatDateShort(b.endDate)})` : '',
      ]
        .filter(Boolean)
        .join(' ');
      const details = [
        b.title,
        b.location,
        b.confirmationNumber ? `Conf: ${b.confirmationNumber}` : '',
        b.notes || '',
      ]
        .filter(Boolean)
        .join('\n');
      return [TYPE_LABELS[b.type] || b.type, details, when, travelerNames(b).join(', ')];
    });

    autoTable(doc, {
      startY: cursorY + 12,
      head: [['Type', 'Booking', 'When', 'Travelers']],
      body,
      theme: 'striped',
      margin: { left: margin, right: margin, top: 54, bottom: 44 },
      styles: { fontSize: 9, cellPadding: 5, textColor: INK, valign: 'top', lineColor: [232, 236, 241] },
      headStyles: { fillColor: [241, 245, 249], textColor: MUTED, fontSize: 8, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 251, 253] },
      columnStyles: {
        0: { cellWidth: 52, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 78, textColor: MUTED },
        3: { cellWidth: 130 },
      },
      // Color the Type cell by booking type.
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const b = group.items[data.row.index];
          if (b) data.cell.styles.textColor = hexToRgb(typeStyle(b.type).hex);
        }
      },
    });

    cursorY = doc.lastAutoTable.finalY + 20;
  }

  if (groups.length === 0) {
    doc.setTextColor(...MUTED);
    doc.setFontSize(12);
    doc.text('No bookings yet.', margin, cursorY + 10);
  }

  // ---- Footers + running header on continued pages ----
  const total = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${total}`, pageWidth - margin, pageHeight - 24, { align: 'right' });
    doc.text('Travel Itinerary', margin, pageHeight - 24);
    if (i > 1) {
      doc.setFontSize(9);
      doc.setTextColor(...MUTED);
      doc.text('Travel Itinerary — continued', margin, 32);
    }
  }

  doc.save('itinerary.pdf');
}
