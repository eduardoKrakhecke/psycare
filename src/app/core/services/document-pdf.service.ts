
import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';

import {
  documentTypeLabel,
  type PsychologicalDocument
} from '../models/psychological-document.model';

@Injectable({
  providedIn: 'root'
})
export class DocumentPdfService {

  private formatDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    const [year, month, day] = value.split('-');

    return `${day}/${month}/${year}`;
  }

  private cleanText(value: string): string {
    return value
      .replace(/\r\n?/g, '\n')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2022/g, '-')
      .replace(/[^\x09\x0A\x20-\x7E\u00A0-\u00FF]/g, '');
  }

  private safeFilename(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 70);
  }

  exportPdf(document: PsychologicalDocument): void {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const width = pdf.internal.pageSize.getWidth();

    const left = 20;
    const right = 20;
    const usableWidth = width - left - right;
    const bottomLimit = 264;

    let y = 20;

    const watermark = (): void => {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(31);
      pdf.setTextColor(233, 233, 233);

      pdf.text(
        'RASCUNHO - SEM ASSINATURA',
        width / 2,
        158,
        {
          align: 'center',
          angle: 45
        }
      );

      pdf.setTextColor(35, 45, 55);
    };

    const newPage = (): void => {
      pdf.addPage();
      watermark();
      y = 30;
    };

    const ensureSpace = (needed: number): void => {
      if (y + needed > bottomLimit) {
        newPage();
      }
    };

    const writeWrapped = (
      text: string,
      fontSize = 11,
      lineHeight = 6.5
    ): void => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(fontSize);
      pdf.setTextColor(35, 45, 55);

      const paragraphs = this.cleanText(text).split('\n');

      for (const paragraph of paragraphs) {
        if (!paragraph.trim()) {
          ensureSpace(lineHeight);
          y += lineHeight;
          continue;
        }

        const lines = pdf.splitTextToSize(
          paragraph,
          usableWidth
        ) as string[];

        for (const line of lines) {
          ensureSpace(lineHeight);
          pdf.text(line, left, y);
          y += lineHeight;
        }
      }
    };

    watermark();

    // Identidade visual.
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(19);
    pdf.setTextColor(28, 116, 103);
    pdf.text('PsyCare', left, y);

    y += 6;

    pdf.setDrawColor(28, 116, 103);
    pdf.setLineWidth(0.4);
    pdf.line(left, y, width - right, y);

    y += 13;

    pdf.setTextColor(35, 45, 55);
    pdf.setFontSize(14);

    const typeName = documentTypeLabel(document.type);

    const titleLines = pdf.splitTextToSize(
      this.cleanText(typeName.toUpperCase()),
      usableWidth
    ) as string[];

    for (const line of titleLines) {
      pdf.text(line, width / 2, y, {
        align: 'center'
      });

      y += 7;
    }

    y += 5;

    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');

    writeWrapped(
      `Título: ${document.title}`,
      10,
      5.5
    );

    writeWrapped(
      `Paciente: ${document.patientName}`,
      10,
      5.5
    );

    writeWrapped(
      `Data de nascimento: ${
        this.formatDate(document.patientBirthDate)
      }`,
      10,
      5.5
    );

    writeWrapped(
      `Data do documento: ${
        this.formatDate(document.documentDate)
      }`,
      10,
      5.5
    );

    y += 6;

    ensureSpace(15);

    pdf.setDrawColor(210, 220, 220);
    pdf.line(left, y, width - right, y);

    y += 10;

    writeWrapped(document.content, 11, 6.5);

    ensureSpace(24);
    y += 12;

    writeWrapped(
      `Profissional indicado para revisão: ${
        document.professionalName
      }`,
      10,
      5.5
    );

    writeWrapped(
      `CRP: ${document.professionalCrp}`,
      10,
      5.5
    );

    // Cabeçalho de segurança e rodapé em todas as páginas.
    const totalPages = pdf.getNumberOfPages();

    for (let page = 1; page <= totalPages; page++) {
      pdf.setPage(page);

      pdf.setDrawColor(220, 225, 225);
      pdf.line(20, 275, width - 20, 275);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(105, 105, 105);

      pdf.text(
        'MINUTA - Documento não assinado e não emitido.',
        20,
        282
      );

      pdf.text(
        `Página ${page} de ${totalPages}`,
        width - 20,
        282,
        { align: 'right' }
      );
    }

    pdf.setProperties({
      title: document.title,
      subject: typeName,
      author: 'PsyCare - Minuta não assinada',
      creator: 'PsyCare'
    });

    const filename = [
      this.safeFilename(typeName),
      this.safeFilename(document.patientName),
      document.documentDate
    ].join('_') + '.pdf';

    pdf.save(filename);
  }
}
