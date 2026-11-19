# Harbourfront Library Renovation

**Project brief** · Prepared for the facilities committee · *Example document*

The east reading room closes on **January 12** for a 14-week refit. This brief covers scope, budget and the temporary service plan. Full drawings live in the [project folder](https://example.com/harbourfront).

## Scope of work

1. Replace the ceiling grid and LED lighting
2. Re-carpet the reading room and children's corner
   - Low-VOC tile carpet throughout
   - Rubber flooring near the craft tables
3. Add 24 power outlets along the window bench

> Patrons asked for more outlets in every survey since 2022. This is the single most requested change.

## Budget

| Item              | Estimate | Status    |
|:------------------|---------:|:---------:|
| Ceiling & lighting | $86,400 | Quoted    |
| Flooring          | $41,750  | Quoted    |
| Electrical        | $18,200  | Pending   |
| **Total**         | **$146,350** |       |

## Temporary service

- [x] Move holds pickup to the front desk
- [x] Post signage at both entrances
- [ ] Confirm pop-up storytime in the community room

Staff can check the room booking feed with:

```bash
curl -s https://example.com/api/rooms?branch=harbourfront | jq '.bookings[] | {room, start}'
```

---

Questions go to the branch manager. Use `~~strikethrough~~` for changes: ~~March 30~~ April 6 reopening.
