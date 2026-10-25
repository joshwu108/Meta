-- Venue capacity is a floor, not an exclusion.
--
-- `business_candidates` previously required `c.capacity >= p_cohort_size`, which silently hid
-- every venue smaller than the local demand. A cohort size is the number of people who said
-- they are *interested*, not the number who will attend: the pipeline already models that with
-- `attendanceEstimate()`, which applies a 0.6-0.9 turnout factor and caps the result at the
-- venue's capacity. Requiring capacity >= cohort therefore excluded exactly the venues that
-- popular local demand should benefit most -- a 12-seat cafe next to a 19-person cohort was
-- dropped, while the same cohort matched a 30-seat venue two kilometres away.
--
-- Capacity fit is already a *ranking* input, not a filter: findCandidateBusinesses weights it at
-- 0.4 x min(1, cohortSize / capacity), so a venue that fills up scores well and an oversized one
-- scores lower. The prefilter only needs to drop venues too small to host a social event at all,
-- which is the minimum cohort size.
--
-- The literal 4 mirrors MIN_COHORT_SIZE (src/features/business/server/demand-band.ts and
-- src/features/demand/server/config.ts). SQL cannot read MIN_COHORT_SIZE from the environment,
-- so raising that env var above 4 means revisiting this floor.
create or replace function business_candidates(
  p_category    text,
  p_cohort_size int,
  p_lat         numeric,
  p_lng         numeric,
  p_radius_km   numeric
) returns table (
  business_id      uuid,
  name             text,
  category         text,
  neighborhood     text,
  address          text,
  description      text,
  image_url        text,
  hours            jsonb,
  capacity         int,
  event_categories text[],
  hosting_slots    text[],
  equipment_tags   text[],
  formats          text[],
  min_price_cents  int,
  max_price_cents  int,
  distance_km      numeric
)
language sql stable security definer set search_path = public as $$
  select b.id, b.name, b.category, coalesce(b.neighborhood, ''), b.address,
         coalesce(b.description, ''), b.image_url, b.hours,
         c.capacity, c.event_categories, c.hosting_slots, c.equipment_tags, c.formats,
         c.min_price_cents, c.max_price_cents,
         round(haversine_km(p_lat, p_lng, b.lat, b.lng), 3)
    from businesses b
    join business_capabilities c on c.business_id = b.id
   where b.is_active
     and c.accepts_ai_proposals
     and p_category = any (c.event_categories)
     and c.capacity >= least(p_cohort_size, 4)
     and haversine_km(p_lat, p_lng, b.lat, b.lng) <= p_radius_km
   order by 16 asc, b.name asc;
$$;

grant execute on function business_candidates(text, int, numeric, numeric, numeric) to authenticated, service_role, anon;
