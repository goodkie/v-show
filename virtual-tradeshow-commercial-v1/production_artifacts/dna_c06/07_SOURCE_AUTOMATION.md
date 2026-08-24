# dn’a-C06.07 — Source Automation & Quality Gate

## Source Quality Tiers
- `Q0_REJECT`: Missing/corrupt source or resolution $< 1280\times720$. Triggers `BLOCKED_CUSTOMER_INPUT` with task `UPLOAD_BETTER_SOURCE`.
- `Q1_USABLE`: $1280 \le W < 1920$. Staging allowed; warns client on final publish.
- `Q2_GOOD`: $1920 \le W < 3840$. Standard Full HD / 2K Showroom.
- `Q3_PREMIUM`: $3840 \le W < 7680$. 4K Ultra-HD Showroom.
- `Q4_IMMERSIVE_MASTER`: $W \ge 7680$. 8K/16K Studio Master.

## Truthful Experience Routing
- `EQUIRECTANGULAR_360` $\rightarrow$ `PHOTO_IMMERSIVE` (Yaw/Pitch $\theta, \phi$)
- `MULTI_PHOTO_CAPTURE_SET` $\rightarrow$ Evaluates overlap: if $\ge 4$ photos and $\ge 30\%$ overlap $\rightarrow$ `PHOTO_IMMERSIVE`, else `MULTI_VIEW_PHOTO` ($u, v$).
- `SINGLE_BOOTH_PHOTO` $\rightarrow$ `PHOTO_SHOWROOM` ($u, v$).
- `PROFESSIONAL_BOOTH_RENDER` $\rightarrow$ `DESIGNED_VISUAL_SHOWROOM` ($u, v$).
- No synthetic AI hallucination (`GENERATIVE_MISSING_VIEW_FILL = false`).
