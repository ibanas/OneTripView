import * as XLSX from 'xlsx';
import { sortBookings, TYPE_LABELS, CATEGORY_LABELS } from './bookings.js';
import { resolveTravelers } from './people.js';

/** One row per booking/place, Travelers (canonical names) comma-separated. */
export function exportToExcel(bookings, resolver) {
  const names = (b) =>
    resolver
      ? resolveTravelers(b.travelers, resolver).map((c) => c.name)
      : b.travelers;

  const rows = sortBookings(bookings).map((b) => ({
    Type: TYPE_LABELS[b.type] || b.type,
    Category: b.type === 'place' ? CATEGORY_LABELS[b.category] || b.category : '',
    Title: b.title,
    Location: b.location,
    Address: b.address || '',
    'Start Date': b.startDate,
    'Start Time': b.startTime || '',
    'End Date': b.endDate || '',
    'End Time': b.endTime || '',
    Travelers: names(b).join(', '),
    'Confirmation #': b.confirmationNumber || '',
    Link: b.url || '',
    Notes: b.notes || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows, {
    header: [
      'Type',
      'Category',
      'Title',
      'Location',
      'Address',
      'Start Date',
      'Start Time',
      'End Date',
      'End Time',
      'Travelers',
      'Confirmation #',
      'Link',
      'Notes',
    ],
  });

  ws['!cols'] = [
    { wch: 8 }, // Type
    { wch: 12 }, // Category
    { wch: 26 }, // Title
    { wch: 20 }, // Location
    { wch: 36 }, // Address
    { wch: 12 }, // Start Date
    { wch: 10 }, // Start Time
    { wch: 12 }, // End Date
    { wch: 10 }, // End Time
    { wch: 30 }, // Travelers
    { wch: 16 }, // Confirmation #
    { wch: 40 }, // Link
    { wch: 40 }, // Notes
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Itinerary');
  XLSX.writeFile(wb, 'itinerary.xlsx');
}
