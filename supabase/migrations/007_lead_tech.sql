-- Migration 007 — Lead Technician field
-- Separate from onsite_tech — this is the named lead for the site

alter table sites
  add column if not exists lead_technician text;

comment on column sites.lead_technician is 'Lead Technician — named lead from Smartsheet';
