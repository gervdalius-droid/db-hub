-- Invoices: an access area for owners and managers, and its data row belongs to it.
insert into public.workshop_areas(area,label,managers_only) values ('invoices','Invoices',true)
  on conflict (area) do update set managers_only = excluded.managers_only, label = excluded.label;
insert into public.workshop_docs(id,area) values ('dedes-baldai-invoices','invoices')
  on conflict (id) do update set area = excluded.area;
