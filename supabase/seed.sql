insert into morpheus_projects (slug, name, owner_wallet)
values
  ('demo', 'Morpheus Demo Project', 'NhDemoWalletPlaceholder')
on conflict (slug) do nothing;

insert into morpheus_feed_snapshots (symbol, target_chain, price, payload)
values
  ('NEO-USD', 'neo_n3', 0, '{"source":"seed"}'::jsonb),
  ('GAS-USD', 'neo_x', 0, '{"source":"seed"}'::jsonb)
on conflict do nothing;
