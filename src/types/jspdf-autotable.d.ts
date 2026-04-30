import 'jspdf';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: AutoTableOptions) => jsPDF;
    lastAutoTable: AutoTableOutput;
  }
}

interface AutoTableOptions {
  head?: string[][];
  body?: string[][];
  foot?: string[][];
  startY?: number;
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  styles?: StyleOptions;
  headStyles?: StyleOptions;
  bodyStyles?: StyleOptions;
  footStyles?: StyleOptions;
  alternateRowStyles?: Partial<StyleOptions>;
  columnStyles?: Record<string | number, Partial<StyleOptions>>;
  theme?: 'striped' | 'grid' | 'plain';
  tableWidth?: number | 'auto' | 'wrap';
  didDrawPage?: (data: { doc: jsPDF }) => void;
  didDrawCell?: (data: any) => void;
  willDrawCell?: (data: any) => void;
  [key: string]: any;
}

interface StyleOptions {
  fontSize?: number;
  fontStyle?: 'normal' | 'bold' | 'italic' | 'bolditalic';
  textColor?: [number, number, number];
  fillColor?: [number, number, number];
  lineColor?: [number, number, number];
  lineWidth?: number;
  cellPadding?: number | number[];
  halign?: 'left' | 'center' | 'right';
  valign?: 'top' | 'middle' | 'bottom';
  overflow?: 'linebreak' | 'ellipsize' | 'visible' | 'hidden';
  minCellHeight?: number;
  minCellWidth?: number;
}

interface AutoTableOutput {
  table: {
    startX: number;
    startY: number;
    width: number;
    height: number;
    contentHeight: number;
    rows: any[];
    columns: any[];
    headerRow: any;
    footerRow: any;
  };
  pageCount: number;
}
