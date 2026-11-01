export const charts = [
  {
    title: 'How the model works', category: 'Method', file: '01_model_explanation.png',
    caption: 'Monthly KNMI observations feed a separate LSTM for each indicator. A 60-month input window predicts one month; longer forecasts reuse predictions.',
  },
  {
    title: 'One-month forecast · January 2026', category: 'Experimental forecast', file: '02a_one_month_prediction.png', horizon: 1,
    caption: 'January 2026 predictions alongside measured 2025 values. The forecast was made from observations ending in December 2025.',
  },
  {
    title: 'Twelve-month forecast · 2026', category: 'Experimental forecast', file: '02b_twelve_month_predictions.png', horizon: 12,
    caption: 'Monthly predictions for temperature, rainfall and wind speed in 2026, made from observations ending in December 2025.',
  },
  {
    title: 'Five-year forecast · 2026–2030', category: 'Experimental forecast', file: '02c_five_year_experimental.png', horizon: 60,
    caption: 'An experimental 60-month forecast without new measurements. This is a station-level model experiment, not a long-term climate scenario.',
  },
  {
    title: 'Accuracy at 1, 12 and 60 months', category: 'Historical validation', file: '03_accuracy_1_12_60.png',
    caption: 'Historical prediction errors for temperature, rainfall and wind. Each horizon is evaluated at the same 20 forecast starts.',
  },
  {
    title: 'LSTM versus seasonal baseline', category: 'Historical validation', file: '02_error_1_12_60_months.png',
    caption: 'Mean absolute error at the selected month ahead. The LSTM improves on the baseline for temperature and wind at all three horizons; rainfall performance is mixed.',
  },
  {
    title: 'Five-year historical example', category: 'Historical validation', file: '03_five_year_historical_example.png',
    caption: 'A forecast starting in January 2020, compared with measured values and the seasonal baseline through December 2024.',
  },
  {
    title: 'Observations and forecast to 2030', category: 'Experimental forecast', file: '04_historical_and_future_forecast.png',
    caption: 'Annual measured weather and the experimental forecast. Temperature and wind are annual means; rainfall is an annual total.',
  },
  {
    title: 'Measured versus forecast averages', category: 'Experimental forecast', file: '05_five_year_climate_comparison.png',
    caption: 'Measured 2021–2025 conditions compared with the 2026–2030 LSTM output. The lower temperature forecast should not be interpreted as evidence against long-term warming.',
  },
  {
    title: 'KNMI’23 scenarios · 2050', category: 'Long-term climate context', file: '04_knmi23_long_term_scenarios.png',
    caption: 'Supplied KNMI’23 national scenario chart: changes relative to 1991–2020. L/H denote lower/higher emissions; d/n denote drier/wetter variants. These scenarios are separate from the LSTM forecast.',
  },
  {
    title: 'Connections to the site design', category: 'Design considerations', file: '04b_design_connections.png',
    caption: 'Planning connections proposed in the supplied analysis: shade and trees, rain gardens and water storage, and local wind-comfort testing. These are not measured design-performance results.',
  },
  {
    title: 'Model training', category: 'Method', file: '06_model_training.png',
    caption: 'Training and validation loss for the historical LSTM models. Loss is mean squared error on the scaled seasonal anomalies.',
  },
];
