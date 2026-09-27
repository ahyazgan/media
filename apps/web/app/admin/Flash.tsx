/** Server action sonrası ?ok= / ?hata= mesajı. */
export function Flash({ sp }: { sp: { ok?: string; hata?: string } }) {
  if (sp.ok) return <p className="k-admin__flash k-admin__flash--ok">{sp.ok}</p>;
  if (sp.hata) return <p className="k-admin__flash k-admin__flash--err">{sp.hata}</p>;
  return null;
}
