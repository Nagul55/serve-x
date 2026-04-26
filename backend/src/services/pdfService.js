import { jsPDF } from 'jspdf';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_DIR = path.resolve(__dirname, '../../../public/uploads');

/**
 * Generates a professional assignment PDF for a volunteer.
 * Returns the public URL to the PDF.
 */
export async function generateAssignmentPdf({
  volunteerName,
  task,
  needTitle,
  priority,
  dueDate,
  location,
  mapsUrl,
}) {
  const doc = new jsPDF();
  const titleColor = [46, 125, 50]; // ServeX Green

  // Header
  doc.setFontSize(22);
  doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
  doc.text('ServeX Assignment Brief', 20, 25);

  doc.setDrawColor(200, 200, 200);
  doc.line(20, 30, 190, 30);

  // Volunteer Info
  doc.setFontSize(12);
  doc.setTextColor(50, 50, 50);
  doc.text(`Volunteer: ${volunteerName}`, 20, 45);
  doc.text(`Date Issued: ${new Date().toLocaleDateString()}`, 20, 52);

  // Assignment Details
  doc.setFontSize(16);
  doc.setTextColor(titleColor[0], titleColor[1], titleColor[2]);
  doc.text('Assignment Details', 20, 70);

  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  
  let y = 80;
  const addLine = (label, value) => {
    if (!value) return;
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}:`, 20, y);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), 60, y);
    y += 10;
  };

  addLine('Need', needTitle);
  addLine('Priority', priority?.toUpperCase());
  addLine('Due Date', dueDate);
  addLine('Location', location);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Task Description:', 20, y);
  y += 10;
  doc.setFont('helvetica', 'normal');
  const splitTask = doc.splitTextToSize(task || 'No description provided.', 150);
  doc.text(splitTask, 20, y);
  y += (splitTask.length * 7);

  if (mapsUrl) {
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 255);
    doc.text('View on Google Maps:', 20, y);
    y += 8;
    doc.setFontSize(10);
    if (typeof doc.textWithLink === 'function') {
      doc.textWithLink('Open route in Google Maps', 20, y, { url: mapsUrl });
      y += 7;
    }
    doc.text(mapsUrl, 20, y);
  }

  // Footer
  doc.setFontSize(10);
  doc.setTextColor(150, 150, 150);
  doc.text('This is an official ServeX assignment. Please report progress via WhatsApp.', 20, 280);

  // Save to disk
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const buffer = Buffer.from(doc.output('arraybuffer'));

  let fileName = '';
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    fileName = `assignment_${Date.now()}_${randomUUID().slice(0, 8)}.pdf`;
    const filePath = path.join(UPLOADS_DIR, fileName);

    try {
      fs.writeFileSync(filePath, buffer, { flag: 'wx' });
      return `/uploads/${fileName}`;
    } catch (error) {
      lastError = error;
      if (!['EEXIST', 'EPERM', 'EBUSY'].includes(error.code)) {
        throw error;
      }
    }
  }

  throw lastError || new Error('Unable to save assignment PDF');
}
