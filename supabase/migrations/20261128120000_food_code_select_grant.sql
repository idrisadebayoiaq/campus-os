-- Students could not read their own delivery / pickup code: the table had row-level
-- security but the signed-in role was never granted SELECT, so every read failed.
-- Row-level security still limits each student to the codes of their own orders.
grant select on public.food_order_codes to authenticated;
