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

function d2qqs(d) {
  return d.getFullYear() + " Q" + (Math.floor(d.getMonth() / 3) + 1);
}

function s2qqd(d) {
  date = d3.timeParse("%Y-%m-%d")(d);
  date.setDate(1);
  date.setMonth(Math.floor(date.getMonth() / 3) * 3);
  return date;
}

function minMaxBfr(data, is, min0=false) {
  var min = d3.min(data, d => Math.min(...is.map(i => d[i])));
  var max = d3.max(data, d => Math.max(...is.map(i => d[i])));
  var bfr = (max - min) * .04;

  min -= bfr;
  if (min0) {
    min = Math.min(0, min);
  }

  return [min, max + bfr];
};

function loadData() {
  var CPI = d3.csv(cpiFile, r => ({date: s2qqd(r.DATE), cpi: +r.CPIAUCSL}));
  var MSP = d3.csv(mspFile, r => ({date: s2qqd(r.DATE), msp: +r.MSPUS}));
  var M30 = d3.csv(m30File, r => ({date: s2qqd(r.DATE), m30: +r.MORTGAGE30US*.01}));

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

function drawLineChart(data, title, div, width, height, ys, yfmt) {
  div.append("h2").text(title)
  var tooltip = div.append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  svg = div.append("svg")
  svg.attr("width", width).attr("height", height);

  svg = svg.append("g")
    .attr("transform", "translate(" + padding.left + ", " + padding.top + ")");
  width -= (padding.left + padding.right);
  height -= (padding.top + padding.bottom);

  var x = d3.scaleTime()
    .domain(d3.extent(data, d => d.date))
    .range([0, width-1]);

  var y = d3.scaleLinear()
    .domain(minMaxBfr(data, ys.map(y => y.y), true))
    .range([height, 0]);

  var line = svg.append('line')
    .attr('stroke', '#DDDDDD')
    .attr('opacity', 0)
    .attr('stroke-width', 1)
    .attr('x1', 0).attr('y1', 0)
    .attr('x2', 0).attr('y2', height);
  DATE_LISTENERS.push(date => {
    datex = x(date);
    line.attr('x1', datex).attr('x2', datex).attr('opacity', 1);
  });
  HIDE_LISTENERS.push(() => {
    line.attr('opacity', 0);
  });

  for (var i=0; i<ys.length; i++) {
    svg.append("path")
      .datum(data)
      .attr("fill", "none")
      .attr("stroke", ys[i].color)
      .attr("stroke-width", 2)
      .style("stroke-dasharray", ys[i].dashes)
      .attr("d", d3.line()
        .x(d => x(d.date))
        .y(d => y(d[ys[i].y])));
  }
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(x));
  svg.append("g")
    .attr("class", "axis")
    .call(yfmt(d3.axisLeft(y).ticks(5)));

  svg.append('rect')
    .attr('class', 'invisible-mouse-detector')
    .style('opacity', 0)
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', width)
    .attr('height', height)
    .on("mousemove", (event) => {
      var date = x.invert(d3.pointer(event)[0]);
      var qqs = d2qqs(date);
      var d = data.filter(d => qqs == d2qqs(d.date))[0];
      var text = "Date: " + qqs;
      ys.sort((y1, y2) => d[y2.y] - d[y1.y])
        .forEach(y => text += "<br/>" + y.y.toUpperCase() + ": " + y.fmt(d[y.y]));
      tooltip.html(text)
        .style("top", (event.pageY - 40) + "px")
        .style("left", (event.pageX + 15) + "px")
        .style("opacity", 1);
      renderDate(date);
    })
    .on("mouseout", () => {
      tooltip.style("opacity", 0)
        .style("top", "0px")
        .style("left", "0px");
      renderNoDate()
    });
}

function drawScatterPlot(data, title, div, width, height, x, y) {

  div.append("h2").text(title)
  var tooltip = div.append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

  svg = div.append("svg")
  svg.attr("width", width).attr("height", height);

  width -= (padding.left + padding.right);
  height -= (padding.top + padding.bottom);

  svg = svg.append("g")
    .attr("transform", "translate(" + padding.left + ", " + padding.top + ")");

  var xd = d3.scaleLinear()
    .domain(minMaxBfr(data, [x]))
    .range([0, width]);

  var yd = d3.scaleLinear()
    .domain(minMaxBfr(data, [y]))
    .range([height, 0]);

  svg.append("g")
    .selectAll("dot")
    .data(data).enter()
    .append("circle")
      .attr("cx", d => xd(d[x]))
      .attr("cy", d => yd(d[y]))
      .attr("r", 5)
      .style("fill", "#EEEEEE7F")
      .on('mouseover', function (event, d) {
        d3.select(this).transition()
          .duration('100')
          .attr("r", 10)
          .style("fill", "#FFFFFFFF");
        var text = "Date: " + d2qqs(d.date)
          + "<br/>30Y: " + d3.format(".2%")(d.m30);

        tooltip.html(text)
          .style("top", (event.pageY - 40) + "px")
          .style("left", (event.pageX + 15) + "px")
        tooltip.transition()
          .duration(100)
          .style("opacity", 1);
      })
      .on('mouseout', function (d, i) {
        d3.select(this).transition()
          .duration('100')
          .attr("r", 5)
          .style("fill", "#EEEEEE7F");
        tooltip.transition()
          .duration(100)
          .style("opacity", 0);
      });
  svg.append("g")
    .attr("class", "axis")
    .attr("transform", "translate(0," + height + ")")
    .call(d3.axisBottom(xd).tickFormat(d3.format(".0%")));
  svg.append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yd).tickFormat(d3.format("$,")));
}

function renderMMP(div, width, height) {
  DATA.then(data => drawLineChart(data, "Median Monthly Payment", div, width, height,
    [{y: 'mmp', color: 'steelblue', dashes: 0, fmt: d3.format("$,.0f")},
     {y: 'mmpa', color: 'steelblue', dashes: [2,2], fmt: d3.format("$,.0f")}],
    yfmt => yfmt.tickFormat(d3.format("$,.0f"))));
}

function renderMSP(div, width, height) {
  DATA.then(data => drawLineChart(data, "Median Sales Price", div, width, height,
    [{y: 'msp', color: 'crimson', dashes: 0, fmt: d3.format("$,.0f")},
     {y: 'mspa', color: 'crimson', dashes: [2,2], fmt: d3.format("$,.0f")}],
    yfmt => yfmt.tickFormat(d3.format("$,.0f"))));
}

function renderM30(div, width, height) {
  DATA.then(data => drawLineChart(data, "30 Year Mortage Rate", div, width, height,
    [{y: 'm30', color: 'goldenrod', dashes: 0, fmt: d3.format(".2%")}],
    yfmt => yfmt.tickFormat(d3.format(".0%"))));
}

function render(scene) {
  console.log("scene: " + scene);
  DATE_LISTENERS = [];
  HIDE_LISTENERS = [];
  vis.selectAll("*").remove();

  if (scene == 0) {
    render0();
  } else if (scene == 1) {
    render1();
  } else if (scene == 2) {
    render2();
  } else if (scene == 3) {
    render3();
  } else {
    render4();
  }

  var buttonDiv = vis.append("div").attr("class", "buttons");
  var backVisible = (scene > 0) ? "visible" : "hidden";
  buttonDiv.append("button").text("Back").attr("class", "back")
    .style("visibility", backVisible)
    .on("click", () => render(scene-1));
  var nextVisible = (scene < 4) ? "visible" : "hidden";
  buttonDiv.append("button").text("Next").attr("class", "next")
    .style("visibility", nextVisible)
    .on("click", () => render(scene+1));
}

function render0() {
  vis.append("h1").text("What's Next For The US Housing Market?");
  vis.append("p").text("A look at the historical relationship between Median "
    + "Sales Price and the Average 30 Year Mortgage Rate.");

  vis.append("h3").text("Sources");
  sources = vis.append("ul");
  sources.append("li").append("a").text("Average 30-Year Fixed Rate Mortgage")
    .attr("href", "https://fred.stlouisfed.org/series/MORTGAGE30US")
  sources.append("li").append("a").text("Consumer Price Index")
    .attr("href", "https://fred.stlouisfed.org/series/CPIAUCSL")
  sources.append("li").append("a").text("Median Sales Price")
    .attr("href", "https://fred.stlouisfed.org/series/MSPUS")
}

function render1() {
  renderMSP(vis.append("div"), 800, 400);
}

function render2() {
  renderMMP(vis.append("div"), 800, 400);
}

function render3() {
  div1 = vis.append("div").style("overflow", "hidden");
  div1a = div1.append("div").attr("class", "float-half");
  div1b = div1.append("div").attr("class", "float-half");
  div2 = vis.append("div");
  renderMSP(div1a, 400, 150);
  renderMMP(div1b, 400, 150);
  renderM30(div2, 800, 300);
}

function render4() {
  var div = vis.append("div");
  DATA.then(data => drawScatterPlot(data, "30Y Mortgage vs Monthly Payment",
    div, 800, 300, 'm30', 'mmpa'));
  var div2 = vis.append("div");
  DATA.then(data => drawScatterPlot(data, "30Y Mortgage vs Median Sales Price",
    div2, 800, 300, 'm30', 'mspa'));
}

function renderDate(d) {
  console.log("renderDate: " + d);
  DATE_LISTENERS.map(l => l(d));
}

function renderNoDate() {
  console.log("renderNoDate");
  HIDE_LISTENERS.map(l => l());
}

var DATA = loadData();
var DATE_LISTENERS = [];
var HIDE_LISTENERS = [];
var padding = {top: 0, right: 10, bottom: 20, left: 60};
var vis = d3.select("body").append("div");
render(1);

console.log(d3.format("$,")(123456789))
