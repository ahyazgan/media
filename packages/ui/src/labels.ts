export const CATEGORY_LABELS: Record<string, string> = {
  borsa: "Borsa", mevzuat: "Mevzuat", makro: "Makro", bankacilik: "Bankacılık", enerji: "Enerji", sirketler: "Şirketler", diger: "Diğer",
};
export const categoryLabel = (c: string) => CATEGORY_LABELS[c] ?? c;
