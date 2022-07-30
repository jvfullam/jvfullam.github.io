const cpiFile = "https://jvfullam.github.io/cs416/CPI.csv";
const mspFile = "https://jvfullam.github.io/cs416/MSP.csv";
const m30File = "https://jvfullam.github.io/cs416/M30.csv";

function getMonthlyPayment(price, mortgageRate, downPayment=0.2) {
  var P = price * (1 - downPayment); // principle loan amount
  var I = mortgageRate / 12; // monthly interest rate
  var N = 12 * 30; // total monthly payments
  var T = (1+I)**N; // total interest rate
  return P * (I * T) / (T - 1);
}

function loadData() {

  var yyyyqq = d => {
    date = d3.timeParse("%Y-%m-%d")(d);
    date.setDate(1);
    date.setMonth(Math.floor(date.getMonth() / 3) * 3);
    return date;
  };

  var CPI = d3.csv(cpiFile, r => ({date: yyyyqq(r.DATE), cpi: +r.CPIAUCSL}));
  var MSP = d3.csv(mspFile, r => ({date: yyyyqq(r.DATE), msp: +r.MSPUS}));
  var M30 = d3.csv(m30File, r => ({date: yyyyqq(r.DATE), m30: +r.MORTGAGE30US*.01}));

  CPI = CPI.then(data => {
    for (var i=12; i<data.length; i++) {
      data[i].cpiyoy = (data[i].cpi / data[i-12].cpi) - 1;
    }
    return data;
  });

  /* The time series use different intervals (weekly/monthly/quarterly), so
     we'll using the coarsest interval and taking the avg when a source has
     multiple readings in that interval. The series also start and end at
     different points in time so we'll just look at the overlapping part */
  return Promise.all([CPI, MSP, M30]).then(([cpi, msp, m30]) => {
    var merged = [];

    var ds = [
      {d: cpi, i: 0, l: cpi.length, v: 'cpi'},
      {d: cpi, i: 0, l: cpi.length, v: 'cpiyoy'},
      {d: msp, i: 0, l: msp.length, v: 'msp'},
      {d: m30, i: 0, l: m30.length, v: 'm30'}
    ];

    var date = ds[0].d[ds[0].i].date;
    while(ds[0].i < ds[0].l && ds[1].i < ds[1].l && ds[2].i < ds[2].l) {
      for (var x=0; x<ds.length; x++) {
        if (ds[x].d[ds[x].i].date > date) {
          date = ds[x].d[ds[x].i].date;
        }
      }

      for (var x=0; x<ds.length; x++) {
        while (ds[x].i < ds[x].l && ds[x].d[ds[x].i].date < date) {
          ds[x].i++;
        }
      }

      var dateMerged = {date: date};
      for (var x=0; x<ds.length; x++) {
        sumCnt = [0, 0];
        while (ds[x].i < ds[x].l && ds[x].d[ds[x].i].date <= date) {
          sumCnt[0] += ds[x].d[ds[x].i][ds[x].v];
      	  sumCnt[1] += 1;
          ds[x].i++;
        }
        dateMerged[ds[x].v] = sumCnt[0] / sumCnt[1];
      }
      merged.push(dateMerged);
    }

    var lastCpi = merged[merged.length - 1].cpi
    for (var i=0; i<merged.length; i++) {
      merged[i].mspa = merged[i].msp * lastCpi / merged[i].cpi;
      merged[i].mmp = getMonthlyPayment(merged[i].msp, merged[i].m30);
      merged[i].mmpa = merged[i].mmp * lastCpi / merged[i].cpi;
    }
    return merged;
  });
}

DATA = loadData();

var padding = {top: 0, right: 50, bottom: 20, left: 50};

function drawLineChart(data, title, div, width, height, ys, yfmt) {
  div.selectAll("*").remove();
  div.append("h2").text(title)
  svg = div.append("svg")
  svg.attr("width", width).attr("height", height);

  width -= (padding.left + padding.right);
  height -= (padding.top + padding.bottom);

  svg = svg.append("g")
    .attr("transform", "translate(" + padding.left + ", " + padding.top + ")");

  var x = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([0, width]);
  svg.append("g")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x));

  var y = d3.scaleLinear()
    .domain([0, d3.max(data, d => Math.max(...ys.map(y => d[y.y])))])
    .range([height, 0]);
  svg.append("g")
    .call(yfmt(d3.axisLeft(y)));

  for (var i=0; i<ys.length; i++) {
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", ys[i].color)
      .attr("stroke-width", 1.5)
      .attr("d", d3.line()
        .x(d => x(d.date))
        .y(d => y(d[ys[i].y])));
  }
}

var vis = d3.select("#vis");

DATA.then(data => drawLineChart(data, "30 Year Mortage Rate",
  vis.append("div"), 600, 200,
  [{y: 'm30', color: 'steelblue'}],
  yfmt => yfmt.tickFormat(d3.format(".0%"))));

DATA.then(data => drawLineChart(data, "Inflation",
  vis.append("div"), 600, 200,
  [{y: 'cpiyoy', color: 'steelblue'}],
  yfmt => yfmt.tickFormat(d3.format(".0%"))));

DATA.then(data => drawLineChart(data, "Median Sales Price",
  vis.append("div"), 600, 400,
  [{y: 'msp', color: 'steelblue'}, {y: 'mspa', color: 'red'}],
  yfmt => yfmt));

DATA.then(data => drawLineChart(data, "Median Monthly Payment",
  vis.append("div"), 600, 400,
  [{y: 'mmp', color: 'steelblue'}, {y: 'mmpa', color: 'red'}],
  yfmt => yfmt));
