import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';

import type { Charge, Payment } from '../models/financial.model';
import type { Patient } from '../models/patient.model';

export interface ReceiptSignature {
  dataUrl: string;
  signerName: string;
  signerCrp: string;
}

export interface ReceiptProfessional {
  name: string;
  crp: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentReceiptPdfService {
  private money(cents: number): string {
    return (cents / 100).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  private date(value: unknown): string {
    if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof value.toDate === 'function'
    ) {
      return value.toDate().toLocaleString('pt-BR');
    }

    return String(value ?? '');
  }

  private safeFilename(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  exportReceipt(
    patient: Patient,
    charge: Charge,
    payment: Payment,
    options: {
      professional?: ReceiptProfessional;
      signature?: ReceiptSignature;
    } = {}
  ): void {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const width = pdf.internal.pageSize.getWidth();
    const left = 24;
    let y = 28;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(21);
    pdf.setTextColor(28, 116, 103);
    pdf.text('PsyCare', left, y);

    y += 8;
    pdf.setDrawColor(28, 116, 103);
    pdf.line(left, y, width - left, y);
    y += 22;

    pdf.setTextColor(35, 45, 55);
    pdf.setFontSize(16);
    pdf.text('RECIBO DE PAGAMENTO', width / 2, y, {
      align: 'center'
    });

    y += 18;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);

    const lines = [
      `Recebemos de: ${patient.fullName}`,
      `Referente a: ${charge.description}`,
      `Valor recebido: ${this.money(payment.amountCents)}`,
      `Forma de pagamento: ${payment.method}`,
      `Data do pagamento: ${this.date(payment.recordedAt)}`,
      `Psicologo responsavel: ${
        options.professional?.name ?? 'Nao informado'
      }`,
      `CRP: ${options.professional?.crp ?? 'Nao informado'}`
    ];

    for (const line of lines) {
      pdf.text(line, left, y);
      y += 9;
    }

    if (payment.note) {
      y += 4;
      pdf.text(`Observacao: ${payment.note}`, left, y);
      y += 14;
    }

    y += 18;

    if (options.signature) {
      pdf.addImage(
        options.signature.dataUrl,
        'PNG',
        width / 2 - 26,
        y - 18,
        52,
        26
      );
      pdf.setFontSize(9);
      pdf.text(
        `Assinado por: ${options.signature.signerName}`,
        width / 2,
        y + 13,
        { align: 'center' }
      );
      pdf.text(
        `CRP: ${options.signature.signerCrp}`,
        width / 2,
        y + 17,
        { align: 'center' }
      );
      pdf.text('Assinatura desenhada no PsyCare', width / 2, y + 23, {
        align: 'center'
      });
    } else {
      pdf.setDrawColor(160, 170, 170);
      pdf.line(left + 34, y, width - left - 34, y);
      y += 6;
      pdf.setFontSize(9);
      pdf.text('Responsavel pelo recebimento', width / 2, y, {
        align: 'center'
      });
    }

    y = 270;
    pdf.setFontSize(8);
    pdf.setTextColor(105, 105, 105);
    pdf.text(
      'Recibo gerado pelo PsyCare. Confira os dados antes de entregar.',
      left,
      y
    );

    pdf.setProperties({
      title: `Recibo - ${patient.fullName}`,
      subject: 'Recibo de pagamento',
      author: 'PsyCare',
      creator: 'PsyCare'
    });

    pdf.save([
      'recibo',
      this.safeFilename(patient.fullName),
      this.safeFilename(payment.id)
    ].join('_') + '.pdf');
  }
}
