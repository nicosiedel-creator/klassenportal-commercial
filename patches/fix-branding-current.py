from pathlib import Path
p=Path('public/app.js')
s=p.read_text()
old='</div><label class="field">Logo-URL<input name="logo_url" value="${h(x.logo_url)}"></label>'
new='</div><input type="hidden" name="background_color" value="${h(x.background_color||\'#ece8df\')}"><input type="hidden" name="accent_color" value="${h(x.accent_color||\'#7c3aed\')}"><input type="hidden" name="surface_color" value="${h(x.surface_color||\'#f3f0ea\')}"><input type="hidden" name="text_color" value="${h(x.text_color||\'#172033\')}"><label class="field">Logo-URL<input name="logo_url" value="${h(x.logo_url)}"></label>'
if old not in s: raise SystemExit('branding form anchor missing')
p.write_text(s.replace(old,new,1))
print('current branding values preserved')
