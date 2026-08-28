# Consultation & Custom Quote Intake Engine

Implemented via /api/consultation-requests and /api/consultations:

- Unique ticket prefixes:
  - 3DNA-VFR-XXXXXX (Fitting Room)
  - 3DNA-VMA-XXXXXX (Makeup Artist)
  - 3DNA-CUSTOM-XXXXXX (Custom Enterprise Plan)
  - 3DNA-PTN-XXXXXX (Strategic Partnerships)
- Duplicate submission suppression within 60-second window.
- Admin status management (NEW, CONTACTED, QUALIFIED, CLOSED).
