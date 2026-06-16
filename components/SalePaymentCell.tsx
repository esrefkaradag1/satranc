import React from 'react';
import type { Transaction } from '../types';
import { getSalePaymentInfo } from '../lib/salePaymentUtils';

const SalePaymentCell: React.FC<{ transaction: Transaction }> = ({ transaction }) => {
  const info = getSalePaymentInfo(transaction);

  if (info.status === 'neutral') {
    return (
      <span className="inline-flex px-2 py-1 rounded-lg font-black text-emerald-200 bg-emerald-500/30 border border-emerald-400/50">
        ₺{info.received.toLocaleString('tr-TR')}
      </span>
    );
  }

  const complete = info.status === 'complete';

  return (
    <div className="space-y-1">
      <div className={`text-xs font-black ${complete ? 'text-emerald-200' : 'text-rose-200'}`}>
        Alınan: ₺{info.received.toLocaleString('tr-TR')}
      </div>
      <div className="text-[10px] text-slate-300 font-semibold">
        Toplam: ₺{info.total!.toLocaleString('tr-TR')}
      </div>
      {complete ? (
        <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-black uppercase bg-emerald-500/35 text-emerald-100 border border-emerald-400/55 shadow-sm shadow-emerald-500/20">
          Tamamlandı
        </span>
      ) : (
        <span className="inline-flex px-2 py-1 rounded-md text-[10px] font-black uppercase bg-rose-500/35 text-rose-100 border border-rose-400/55 shadow-sm shadow-rose-500/20">
          Eksik: ₺{info.remaining.toLocaleString('tr-TR')}
        </span>
      )}
    </div>
  );
};

export default SalePaymentCell;
