export interface SampleReceiptPayload {
  dataUrl: string;
  base64: string;
  mimeType: 'image/png';
  filename: string;
}

export function generateSampleSupplierReceipt(): SampleReceiptPayload {
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 620;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context is unavailable in this browser.');
  }

  ctx.fillStyle = '#fafaf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#d6d3d1';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 21px monospace';
  ctx.fillText('NAIROBI WHOLESALE TRADERS LTD', 42, 68);

  ctx.font = '14px monospace';
  ctx.fillStyle = '#44403c';
  ctx.fillText('INVOICE #NWT-4412   |   PIN: P051992841Q', 42, 96);
  ctx.fillText('SUPPLIER: KAMAU DISTRIBUTORS (WHOLESALE)', 42, 118);

  ctx.strokeStyle = '#78716c';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(42, 140);
  ctx.lineTo(canvas.width - 42, 140);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = '#1c1917';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('QTY  ITEM                      TOTAL (KES)', 42, 172);

  ctx.font = '15px monospace';
  const lines = [
    ['6x', 'Pembe Maize Flour 2kg', '930.00'],
    ['4x', 'Fresh Fri Cooking Oil 1L', '1,120.00'],
    ['12x', 'Brookside Milk 500ml', '600.00'],
  ];

  let y = 212;
  for (const [qty, name, amount] of lines) {
    ctx.fillText(qty.padEnd(5, ' ') + name.padEnd(25, ' ') + amount.padStart(9, ' '), 42, y);
    y += 38;
  }

  ctx.strokeStyle = '#78716c';
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(42, 344);
  ctx.lineTo(canvas.width - 42, 344);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#1c1917';
  ctx.fillText('SUBTOTAL:                 KES 2,650.00', 42, 384);
  ctx.fillText('PAID VIA M-PESA TILL:     KES 2,650.00', 42, 416);
  ctx.fillText('CREDIT BALANCE DUE:       KES     0.00', 42, 448);

  ctx.font = '13px monospace';
  ctx.fillStyle = '#57534e';
  ctx.fillText('CATEGORY: Wholesale Restock', 42, 504);
  ctx.fillText('PAID STATUS: SUPPLIER_EXPENSE (SETTLED)', 42, 528);
  ctx.fillText('Thank you for stocking with Nairobi Wholesale.', 42, 566);

  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1] ?? '';

  return {
    dataUrl,
    base64,
    mimeType: 'image/png',
    filename: 'nairobi-wholesale-invoice-nwt4412.png',
  };
}
