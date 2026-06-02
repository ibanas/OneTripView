import * as XLSX from 'xlsx';
import { sortBookings, TYPE_LABELS } from './bookings.js';
import { resolveTravelers } from './people.js';

/** One row per booking, Travelers (canonical names) as a comma-separated column. */
export function exportToExcel(bookings, resolver) {
  const names = (b) =>
    resolver
      ? resolveTravelers(b.travelers, resolver).map((c) => c.name)
      : b.travelers;

  const rows = sortBookings(bookings).map((b) => ({
    Type: TYPE_LABELS[b.type] || b.type,
    Title: b.title,
    Location: b.location,
    'Start Date': b.startDate,
    'Start Time': b.startTime || '',
    'End Date': b.endDate || '',
    'End Time': b.endTime || '',
    Travelers: names(b).join(', '),
    'Confirmation #': b.confirmationNumber || '',
    Notes: b.notes || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      'Type',
      'Title',
      'Location',
      'Start Date',
      'Start Time',
      'End Date',
      'End Time',
      'Travelers',
      'Confirmation #',
      'Notes',
    ],
  });

  ws['!cols'] = [
    { wch: 8 }, // Type
    { wch: 26 }, // Title
    { wch: 28 }, // Location
    { wch: 12 }, // Start Date
    { wch: 10 }, // Start Time
    { wch: 12 }, // End Date
    { wch: 10 }, // End Time
    { wch: 30 }, // Travelers
    { wch: 16 }, // Confirmation #
    { wch: 40 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Itinerary');
  XLSX.writeFile(wb, 'itinerary.xlsx');
}
