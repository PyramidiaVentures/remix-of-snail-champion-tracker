# Add AM temperature and humidity ranges

## Build
- Add minimum and maximum temperature and humidity fields to each morning welfare record, while keeping existing single readings intact for historical data.
- Replace the two AM condition inputs with four clear inputs: temperature minimum/maximum and humidity minimum/maximum. Continue applying one site-wide set of readings to every saved pen for that feeding cycle.
- Show the recorded ranges on the daily dashboard and flag the day when either end falls outside the existing target range.
- Update environment trends and weekly summaries to use the recorded minima and maxima, while retaining historical single readings as both ends of the range.
- Include the new fields automatically in the welfare-check export.

## Verify
- Confirm the four values save and reload on the AM Check screen.
- Confirm the daily dashboard and trends display the saved ranges correctly.
- Run type and build checks without changing existing trial calculations.
