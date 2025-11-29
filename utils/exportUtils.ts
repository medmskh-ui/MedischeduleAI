
import { DailySchedule, Doctor, ScheduleConfig } from '../types';
import { format } from 'date-fns';
import th from 'date-fns/locale/th';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Document, 
  Packer, 
  Paragraph, 
  Table, 
  TableCell, 
  TableRow, 
  WidthType, 
  TextRun, 
  AlignmentType, 
  ShadingType, 
  PageOrientation, 
  BorderStyle, 
  VerticalAlign,
  TableLayoutType
} from 'docx';

const saveAs = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
};

const getDocName = (id: string | null, doctors: Doctor[]) => {
  if (!id) return '-';
  const doc = doctors.find(d => d.id === id);
  return doc ? doc.name : '-';
};

// Helper to convert buffer to base64 for jsPDF
const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

const hexToRgb = (hex: string): [number, number, number] | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : null;
};

export const exportToPDF = async (schedule: DailySchedule[], doctors: Doctor[], config: ScheduleConfig) => {
  // Filter schedule to include only the selected month/year
  const selectedSchedule = schedule.filter(day => {
    const d = new Date(day.date);
    return d.getMonth() === config.month && d.getFullYear() === config.year;
  });

  // A4 Portrait
  const doc = new jsPDF('p', 'mm', 'a4'); 
  
  const buddhistYear = config.year + 543;
  const monthName = format(new Date(config.year, config.month), 'MMMM', { locale: th });
  const fullTitle = `ตารางเวรแพทย์อายุรกรรม ประจำเดือน ${monthName} พ.ศ. ${buddhistYear}`;

  try {
    // Correct URLs for Sarabun Font (Raw GitHub is reliable for direct TTF access)
    const fontUrlRegular = "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Regular.ttf";
    const fontUrlBold = "https://raw.githubusercontent.com/google/fonts/main/ofl/sarabun/Sarabun-Bold.ttf";
    
    const [resRegular, resBold] = await Promise.all([
      fetch(fontUrlRegular),
      fetch(fontUrlBold)
    ]);

    if (!resRegular.ok || !resBold.ok) throw new Error("Failed to load fonts from server");

    const [bufRegular, bufBold] = await Promise.all([
      resRegular.arrayBuffer(),
      resBold.arrayBuffer()
    ]);

    doc.addFileToVFS("Sarabun-Regular.ttf", arrayBufferToBase64(bufRegular));
    doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
    
    doc.addFileToVFS("Sarabun-Bold.ttf", arrayBufferToBase64(bufBold));
    doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");

    doc.setFont("Sarabun", "normal");
  } catch (e) {
    console.error("Font loading failed", e);
    alert("ไม่สามารถโหลดฟอนต์ภาษาไทยได้ (อาจเกิดจากปัญหาเครือข่าย) ระบบจะใช้ฟอนต์มาตรฐานซึ่งอาจทำให้อักษรไทยแสดงผลไม่ถูกต้อง");
  }
  
  doc.setFontSize(14);
  doc.setFont("Sarabun", "bold");
  doc.text(fullTitle, 105, 15, { align: 'center' }); // Centered title

  // Calculate width for equal columns
  // A4 Width = 210mm. Left margin 10, Right 10. Usable = 190mm.
  // 7 columns (Date + 3 Gen + 3 ICU)
  const colWidth = 190 / 7;

  // Prepare Body Data with Styles (Colors)
  const tableBody = selectedSchedule.map(day => {
    // Match Word format: Date and Month only (e.g. 1 ม.ค.)
    // Removed day name and holiday name to prevent wrapping
    let dateStr = format(new Date(day.date), 'd MMM', { locale: th });
    
    const isHoliday = day.isHoliday;
    
    // Helper to create a cell object with specific background color
    const createCell = (docId: string | null) => {
      if (!docId) return { content: '-', styles: { fillColor: [255, 255, 255] as [number, number, number] } };
      
      const doctor = doctors.find(d => d.id === docId);
      if (!doctor) return { content: '-', styles: { fillColor: [255, 255, 255] as [number, number, number] } };

      const rgb = hexToRgb(doctor.color);
      return {
        content: doctor.name, // Name only, no phone
        styles: {
          fillColor: (rgb || [255, 255, 255]) as [number, number, number],
          textColor: [50, 50, 50] as [number, number, number],
          fontStyle: 'normal' as 'normal'
        }
      };
    };

    return [
      { 
        content: dateStr, 
        styles: { 
          fillColor: (isHoliday ? [254, 242, 242] : [255, 255, 255]) as [number, number, number], // Red-50 if holiday
          textColor: (isHoliday ? [185, 28, 28] : [0, 0, 0]) as [number, number, number],
          fontStyle: (isHoliday ? 'bold' : 'normal') as 'bold' | 'normal',
          valign: 'middle' as 'middle',
          halign: 'center' as 'center'
        } 
      },
      createCell(day.shifts.morning?.general),
      createCell(day.shifts.afternoon.general),
      createCell(day.shifts.night.general),
      createCell(day.shifts.morning?.icu),
      createCell(day.shifts.afternoon.icu),
      createCell(day.shifts.night.icu),
    ];
  });

  autoTable(doc, {
    head: [
      [
        { content: 'วันที่', rowSpan: 2, styles: { valign: 'middle', halign: 'center', fillColor: [31, 41, 55] as [number, number, number], textColor: 255 } }, // Dark Gray #1F2937
        { content: 'สามัญ / นอกแผนก', colSpan: 3, styles: { halign: 'center', fillColor: [127, 149, 209] as [number, number, number], textColor: 255 } }, // #7F95D1
        { content: 'ICU / CCU', colSpan: 3, styles: { halign: 'center', fillColor: [240, 114, 92] as [number, number, number], textColor: 255 } } // #F0725C
      ],
      [
        'เช้า', 'บ่าย', 'ดึก',
        'เช้า', 'บ่าย', 'ดึก'
      ]
    ],
    body: tableBody,
    startY: 20,
    margin: { top: 20, left: 10, right: 10, bottom: 10 },
    theme: 'grid',
    styles: { 
      font: 'Sarabun', // Strictly apply Thai font
      fontSize: 10, 
      cellPadding: 2,
      valign: 'middle',
      halign: 'center',
      lineWidth: 0.1,
      lineColor: [200, 200, 200] as [number, number, number],
      textColor: [0, 0, 0] as [number, number, number]
    },
    // Enforce equal column width for all 7 columns
    columnStyles: {
      0: { cellWidth: colWidth },
      1: { cellWidth: colWidth },
      2: { cellWidth: colWidth },
      3: { cellWidth: colWidth },
      4: { cellWidth: colWidth },
      5: { cellWidth: colWidth },
      6: { cellWidth: colWidth },
    },
    headStyles: {
      font: 'Sarabun', 
      fontStyle: 'bold',
      lineWidth: 0.1,
      lineColor: [200, 200, 200] as [number, number, number]
    },
    // Customize the sub-header row (index 1) to be gray like Word
    willDrawCell: (data) => {
      if (data.section === 'head' && data.row.index === 1) {
        doc.setFillColor(243, 244, 246); // Gray-100
        doc.setTextColor(0, 0, 0);
      }
    }
  });

  doc.save(`medical_schedule_${buddhistYear}_${config.month + 1}.pdf`);
};

export const exportToDocx = async (schedule: DailySchedule[], doctors: Doctor[], config: ScheduleConfig) => {
  // Filter schedule to include only the selected month/year
  const selectedSchedule = schedule.filter(day => {
    const d = new Date(day.date);
    return d.getMonth() === config.month && d.getFullYear() === config.year;
  });

  const buddhistYear = config.year + 543;
  const monthName = format(new Date(config.year, config.month), 'MMMM', { locale: th });
  const fullTitle = `ตารางเวรแพทย์อายุรกรรม ประจำเดือน ${monthName} พ.ศ. ${buddhistYear}`;
  
  // Logic for Compact Mode (e.g., if days >= 31, use smaller font/margins)
  const isCompact = selectedSchedule.length >= 31;

  const FONT_NAME = "TH SarabunPSK";
  // Reduce font size slightly for 31-day months to fit on page
  const FONT_SIZE_PT = isCompact ? 13 : 14; 
  const FONT_SIZE_HALF_PT = FONT_SIZE_PT * 2; 

  // Reduce vertical margins for cells and page
  const CELL_MARGIN_Y = isCompact ? 20 : 40; // Twips
  const PAGE_MARGIN_Y = isCompact ? 500 : 720; // 500 twips ~= 0.35 inch

  // Helper to create Header Cells with Borders and Centers
  const createHeaderCell = (text: string, color: string, colSpan: number = 1, rowSpan: number = 1) => new TableCell({
    children: [new Paragraph({ 
        children: [new TextRun({ 
            text, 
            bold: true, 
            color: "FFFFFF",
            font: FONT_NAME,
            size: FONT_SIZE_HALF_PT
        })],
        alignment: AlignmentType.CENTER,
    })],
    shading: { fill: color, type: ShadingType.CLEAR },
    columnSpan: colSpan,
    rowSpan: rowSpan,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: CELL_MARGIN_Y, bottom: CELL_MARGIN_Y, left: 40, right: 40 }
  });
  
  const createSubHeaderCell = (text: string) => new TableCell({
    children: [new Paragraph({ 
        children: [new TextRun({ 
            text, 
            bold: true,
            font: FONT_NAME,
            size: FONT_SIZE_HALF_PT
        })],
        alignment: AlignmentType.CENTER 
    })], 
    shading: { fill: "F3F4F6", type: ShadingType.CLEAR }, // Gray-100
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: CELL_MARGIN_Y, bottom: CELL_MARGIN_Y, left: 40, right: 40 }
  });

  const tableRows = [
    // Main Header Row
    new TableRow({
      children: [
        createHeaderCell("วันที่", "1F2937", 1, 2), // Dark Gray
        createHeaderCell("สามัญ / นอกแผนก", "7F95D1", 3, 1), // Custom Blue #7F95D1
        createHeaderCell("ICU / CCU", "F0725C", 3, 1), // Custom Red #F0725C
      ],
    }),
    // Sub Header Row
    new TableRow({
      children: [
        createSubHeaderCell("เช้า"),
        createSubHeaderCell("บ่าย"),
        createSubHeaderCell("ดึก"),
        createSubHeaderCell("เช้า"),
        createSubHeaderCell("บ่าย"),
        createSubHeaderCell("ดึก"),
      ]
    })
  ];

  selectedSchedule.forEach(day => {
    let dateStr = format(new Date(day.date), 'd MMM', { locale: th }); // Short date for column space
    // Removed holiday name logic to prevent wrapping
    
    const isHoliday = day.isHoliday;
    const defaultRowColor = isHoliday ? "FEF2F2" : "FFFFFF"; // Red-50 or White

    // Helper for doctor cell
    const createDocCell = (id: string | null) => {
       const doc = doctors.find(d => d.id === id);
       
       let cellColor = defaultRowColor;
       const paragraphs = [];

       if (!id || !doc) {
         paragraphs.push(new Paragraph({ 
             children: [new TextRun({ text: '-', font: FONT_NAME, size: FONT_SIZE_HALF_PT })],
             alignment: AlignmentType.CENTER
         }));
       } else {
         paragraphs.push(new Paragraph({ 
             children: [new TextRun({ text: doc.name, font: FONT_NAME, size: FONT_SIZE_HALF_PT })],
             alignment: AlignmentType.CENTER
         }));
         
         if (doc.color) {
            cellColor = doc.color.replace('#', '');
         }
       }

       return new TableCell({
         children: paragraphs,
         shading: { fill: cellColor, type: ShadingType.CLEAR },
         verticalAlign: VerticalAlign.CENTER,
         margins: { top: CELL_MARGIN_Y, bottom: CELL_MARGIN_Y, left: 40, right: 40 }
       });
    };

    // Date Cell
    const dateCell = new TableCell({
      children: [new Paragraph({ 
          children: [new TextRun({ text: dateStr, font: FONT_NAME, size: FONT_SIZE_HALF_PT, bold: isHoliday })],
          alignment: AlignmentType.CENTER 
      })],
      shading: { fill: defaultRowColor, type: ShadingType.CLEAR },
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: CELL_MARGIN_Y, bottom: CELL_MARGIN_Y, left: 40, right: 40 }
    });

    tableRows.push(
      new TableRow({
        children: [
          dateCell,
          // General
          createDocCell(day.shifts.morning?.general || null),
          createDocCell(day.shifts.afternoon.general),
          createDocCell(day.shifts.night.general),
          // ICU
          createDocCell(day.shifts.morning?.icu || null),
          createDocCell(day.shifts.afternoon.icu),
          createDocCell(day.shifts.night.icu),
        ]
      })
    );
  });

  // Calculate total width for A4 Portrait with Narrow Margins
  const COL_WIDTH = 1495;

  const doc = new Document({
    sections: [{
      properties: {
        page: {
           size: {
             orientation: PageOrientation.PORTRAIT // Portrait
           },
           margin: {
             top: PAGE_MARGIN_Y, // Dynamic margin
             bottom: PAGE_MARGIN_Y,
             left: 720,
             right: 720
           }
        }
      },
      children: [
        new Paragraph({
          children: [new TextRun({ 
            text: fullTitle,
            font: FONT_NAME,
            size: 36, // 18pt
            bold: true
          })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 }
        }),
        new Table({
          layout: TableLayoutType.FIXED, // FORCE EQUAL WIDTHS
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths: [COL_WIDTH, COL_WIDTH, COL_WIDTH, COL_WIDTH, COL_WIDTH, COL_WIDTH, COL_WIDTH],
          borders: {
             top: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
             bottom: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
             left: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
             right: { style: BorderStyle.SINGLE, size: 4, color: "888888" },
             insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
             insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "DDDDDD" },
          }
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `medical_schedule_${buddhistYear}_${config.month + 1}.docx`);
};
