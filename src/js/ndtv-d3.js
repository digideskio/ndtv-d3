(function (root, factory) {
  root.ndtv_d3 = factory();
}(this, function() {
  //return function module() {
  "use strict";
  
  var default_options = {
    animationDuration: 800,       //Duration of each step animation during play or step actions, in milliseconds
    scrubDuration: 0,             //Sum duration of all step animations when scrubbing, regardless of # of steps
    enterExitAnimationFactor: 0,  //Percentage (0-1) of total step animation time that enter/exit animations should take
    labelOffset: {                //pixel offset of labels
      x: 12,
      y: 0
    },
    nodeSizeFactor: 0.01,         //Percentage (0-1) of viewport size that a node of size 1 will be rendered at
    dataChooser: false,           //show a select box for choosing different graphs?
    dataChooserDir: 'data/',      //web path to dir containing data json files
    playControls: true,           //show the player controls
    slider: true,                 //show the slider control
    animateOnLoad: false,         //play the graph animation on page load
    margin: {                     //graph render area margins
      x: 20,
      y: 10
    },
    graphData: null,              //graph data, either as JSON object or URL to json file
  };

  var properties = {
    svg: null,
    xScale: null,
    yScale: null,
    minTime: null,
    interval: null,
    maxTime: null,
    animate: null,
    baseNodeSize: null,
    currTime: 0,
    graph: null,
    timeIndex:null,
    domTarget:null,
    slider:null,
    nodeCoords: {},
    options: {}
  }

  var ndtvProperties = {
    graph: {
      xlab: null,                     // label caption below the render, on the xaxis
      main: null,                     // main headline above the render
      displaylabels: false ,          // should vertex labels be displayed
      bg: '#fff',                     // background color
      usearrows: true,                // should arrows be drawn on edges?
      xlim: null,                     // range of x values                     
      ylim: null,                     // range of y values  
    }, 
    node: {
      coord: null,                    // coordinates for nodes
      'vertex.cex': 1,                // vertex (node) expansion scale factor
      label: null,                    // labels for vertices
      'label.col': '#000',            // color of node label
      'vertex.col': '#F00',           // node fill color
      'vertex.sides': 50,             // number of sides for vertex polygon (shape)
      'vertex.rot': 0,                // rotation for vertex polygon
      'vertex.tooltip': '',           // vertex tooltip value
      'vertex.border': '#000',        // color of vertex border stroke
      'vertex.css.class': null,       // css class name applied to node
      'vertex.label.css.class': null, // css class name applied to node label
      'vertex.css.style': null,       // css inline-style applied to node (UNIMPLIMENTED)
      'vertex.label.css.style': null, // css inline style applied to node label (UNIMPLEMENTED)
    },
    edge: {
      'edge.lwd': 1,                  // width of vertex border stroke
      'edge.col': '#000',             // edge stroke color
      'edge.tooltip': null,           // edge tooltip value
      'edge.css.class': null,         // css class name applied to edge
      'edge.label.css.class': null,   // css class name applied to edge label
      'edge.css.style': null,         // css inline-style applied to edge (UNIMPLIMENTED)
      'edge.label.css.style': null,   // css inline style applied to edge label (UNIMPLEMENTED)
    }
  }
  //constructor
  var n3 = function(opts, target) {
    var n3 = this;
    
    //initialize class with default properties
    $.extend(true, n3, properties);

    //replace defaults with user-specified options
    $.extend(true, n3.options, default_options);
    $.extend(true, n3.options, opts);

    n3.drawCircleNode = function(selection){
      selection.attr({
        cx: function(d, i) { return n3.xScale(d.renderCoord[0]); },
        cy: function(d, i) { return n3.yScale(d.renderCoord[1]); },
        r: function(d, i) { return d['vertex.cex'] * n3.baseNodeSize; },
      })
    }

    var drawLine = function() {
      return d3.svg.line()
        .x(function(d){return d[0];})
        .y(function(d){return d[1];})
    }

    n3.drawPolygonNode = function(selection){
      selection.attr({
        d: function(d, i) { 
          var sides = d['vertex.sides'];
          var size = d['vertex.cex'] * n3.baseNodeSize;
          var coords = d.renderCoord;
          var rotation = d['vertex.rot'];
          var centerX = n3.xScale(coords[0]);
          var centerY = n3.yScale(coords[1]);

          var rot = rotation * 2 * Math.PI/360
          var base = 1/sides * 2 * Math.PI;
          var poly = [];

          for (var i = 1; i <= sides; i++) {
              var ang = i * base + rot;
              var x = centerX + size * Math.cos(ang);
              var y = centerY + size * Math.sin(ang);
              poly.push([x, y]);
          }
          return drawLine()(poly) + 'Z';
        },
      })
    }

    if (!target) {
      target = d3.select('body').append('div').style({width: '100%', height: '100%'}).node();
      d3.selectAll('html, body').classed({'ndtv-fullscreen': true})
    }
    n3.domTarget = d3.select(target);
    n3.domTarget.classed({'ndtv-d3-container': true});
    n3.SVGSetup();
    if (n3.options.playControls || n3.options.slider) {
      n3.domTarget.append('div').attr('class', 'controls');
    }
    if (n3.options.dataChooser) { n3.createDataChooser(); }
    if (n3.options.playControls) { n3.createPlayControls(); }
    if (n3.options.slider) { n3.createSliderControl(); }

    n3.tooltip = n3.domTarget.append('div').attr('class', 'tooltip')
    if(n3.options.graphData) { n3.loadData(n3.options.graphData); }
  }

  n3.prototype.SVGSetup = function() {
    var n3 = this;

    $(n3.domTarget).resize(function(n) { 
      n3.resizeGraph(n);
    });
    $(window).resize(function(n) { 
      n3.resizeGraph(n);
    });
 
    n3.domTarget
      .append('div').attr('class', 'graph')
      .append("svg:svg")
      .append("defs")

    var svg = n3.domTarget.select('svg')
      .append('g')

    var rect = svg.append("rect")
      .attr('class', 'background')
      .style("fill", "none")
      .style("pointer-events", "all")
      .on('click', function() { n3.hideTooltip();})

    n3.container = svg.append("g")
      .attr('class', 'container')
    n3.container.append('g').attr('class', 'edges');
    n3.container.append('g').attr('class', 'nodes');
    n3.container.append('g').attr('class', 'labels');
    svg.append('g').attr('class', 'main').append('text');
    svg.append('g').attr('class', 'xlab').append('text');

    svg.on('mousedown', function() {
      svg.classed({'dragging': true})
    })
    svg.on('mouseup', function() {
      svg.classed({'dragging': false})
    })

    n3.zoom = d3.behavior.zoom()
      .scaleExtent([.5, 10])
      .on("zoom", function zoomed() {
        n3.container.attr("transform", "translate(" + d3.event.translate + ")scale(" + d3.event.scale + ")");
        n3.moveTooltip();
      })

    svg.call(n3.zoom)
  }

  n3.prototype.initScales = function() {
    var n3 = this;
    var div_width = n3.domTarget.node().offsetWidth
    var div_height = n3.domTarget.node().offsetHeight - $(n3.domTarget.select('.controls').node()).outerHeight(true);

    var xlab = n3.timeIndex[n3.currTime].renderData.graph.xlab;
    var main = n3.timeIndex[n3.currTime].renderData.graph.main;
    var xlabSize = parseFloat(window.getComputedStyle(n3.domTarget.select('.xlab').node(), null).getPropertyValue('font-size'));
    var mainSize = parseFloat(window.getComputedStyle(n3.domTarget.select('.main').node(), null).getPropertyValue('font-size'));
    var mainMargin = 0;
    var xlabMargin = 0;

    if (xlab) {
      xlabMargin = xlabSize*(xlab.length+1)*1.2;
    } 
    if (main) {
      mainMargin = mainSize*(main.length+1)*1.2;
    } 
    
    var margin = {
      x: n3.options.margin.x,
      y: n3.options.margin.y
    }
    if (div_width > div_height) { 
      margin.x = (div_width - div_height)/2
    } else {
      margin.y = (div_height - div_width)/2
    }

    var width = div_width - (margin.x*2);
    var height = div_height - (margin.y*2);

    n3.domTarget.selectAll('svg, .background')
      .attr({
        width: width + margin.x * 2,
        height: height + margin.y * 2
      })
    
    //reset height including main & xlab for graph container translation
    height = height - mainMargin - xlabMargin;

    n3.container.attr("transform", "translate(" + margin.x + "," + (margin.y+mainMargin) + ")");


    var center = margin.x + width/2;
    n3.domTarget.select('.xlab').attr('transform', "translate("+center+","+(div_height-margin.y)+")")
    n3.domTarget.select('.main').attr('transform', "translate("+center+","+(margin.y+mainSize)+")")

    var pixelSpace = height > width ? width : height;
    n3.baseNodeSize = pixelSpace * n3.options.nodeSizeFactor;

    //set the X and Y scales
    n3.xScale = d3.scale.linear()
      .domain([n3.timeIndex[0].renderData.graph.xlim[0],n3.timeIndex[0].renderData.graph.xlim[1]])
      .range([0, pixelSpace]);

    n3.yScale = d3.scale.linear()
      .domain([n3.timeIndex[0].renderData.graph.ylim[0],n3.timeIndex[0].renderData.graph.ylim[1]])
      .range([pixelSpace, 0]);

    //reset zoom translate based on margins
    n3.zoom.translate([margin.x, margin.y+mainMargin])

  }
  
  //creates the (optional) dataChooser element to be used for slecting among multiple JSON files for debugging
  n3.prototype.createDataChooser = function() {
    var n3 = this;

    var div = n3.domTarget.append('div').attr('class', 'data_chooser_container')
    div.append('select').attr('class', 'data_chooser')
    div.append('a').attr({'class': 'video_link', 'target': '_blank'}).html('Video');

    var setVidLink = function(url) {
      div.select('.video_link').attr('href', url.replace('.json', '.mp4'))
    }
    $.get(n3.options.dataChooserDir, function(data){
      div.select('.data_chooser').on('change', function() {
        var url = $(this).val();
        n3.loadData(url);
        setVidLink(url)
      })
      var matches = data.match(/<td><a href="[^"]*"/g);
      $.each(matches, function(i, m) {
        var url = m.match(/href="([^"]*)"/)[1];
        if (url.match(/.json$/)) {
          div.select('.data_chooser').append('option').attr('value', n3.options.dataChooserDir+url).html(url);
        }
        if (i == 1) {
          setVidLink(url);
        }
      })
    })
  }
  
  // creates the play controls using svg icons and defines the attached events
  n3.prototype.createPlayControls = function() {
    var n3 = this;
    
    //define SVG icons to be used in the play controller
    if (d3.select('#ndtv-svg-icons').empty()) {
      $('body').prepend(
      '<svg id="ndtv-svg-icons" display="none" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="176" height="32" viewBox="0 0 176 32">'+
      '  <defs>'+
      '    <g id="icon-play"><path class="path1" d="M26.717 15.179l-13.698-8.486c-0.998-0.654-1.814-0.171-1.814 1.072v16.474c0 1.243 0.818 1.725 1.814 1.070l13.699-8.486c0 0 0.486-0.342 0.486-0.822-0.002-0.478-0.488-0.821-0.488-0.821z"></path></g>'+
      '    <g id="icon-pause"><path class="path1" d="M21.6 4.8c-1.59 0-2.88 0.49-2.88 2.080v18.24c0 1.59 1.29 2.080 2.88 2.080s2.88-0.49 2.88-2.080v-18.24c0-1.59-1.29-2.080-2.88-2.080zM10.4 4.8c-1.59 0-2.88 0.49-2.88 2.080v18.24c0 1.59 1.29 2.080 2.88 2.080s2.88-0.49 2.88-2.080v-18.24c0-1.59-1.29-2.080-2.88-2.080z"></path></g>'+
      '    <g id="icon-first"><path class="path1" d="M11.976 16c0 0.413 0.419 0.707 0.419 0.707l11.64 7.31c0.862 0.565 1.565 0.149 1.565-0.92v-14.195c0-1.070-0.702-1.486-1.565-0.922l-11.64 7.312c0 0.002-0.419 0.294-0.419 0.707zM6.4 8.571v14.858c0 1.421 0.979 1.856 2.4 1.856s2.4-0.435 2.4-1.854v-14.859c0-1.422-0.979-1.858-2.4-1.858s-2.4 0.437-2.4 1.858z"></path></g>'+
      '  </defs>'+
      '</svg>');
    }
    var div = n3.domTarget.select('.controls').append('div').attr('class', 'play-control-container');
    div.html(
      "<div><svg class='icon step-back-control' viewBox='0 0 32 32'><use xlink:href='#icon-first'></use></svg></div>"+
      "<div><svg class='icon play-back-control' viewBox='0 0 32 32'><g transform='rotate(180, 16, 16)'><use xlink:href='#icon-play'></use></g></svg></div>"+
      "<div><svg class='icon pause-control' viewBox='0 0 32 32'><use xlink:href='#icon-pause'></use></svg></div>"+
      "<div><svg class='icon play-forward-control' viewBox='0 0 32 32'><use xlink:href='#icon-play'></use></svg></div>"+
      "<div><svg class='icon step-forward-control' viewBox='0 0 32 32'><g transform='rotate(180, 16, 16)'><use xlink:href='#icon-first'></use></g></svg></div>"
    );

    div.select('.step-back-control').on('click', function() { n3.stepAnimation(1); });
    div.select('.play-back-control').on('click', function() { n3.playAnimation(1); });
    div.select('.pause-control').on('click', function() { n3.endAnimation(); });
    div.select('.play-forward-control').on('click', function() { n3.playAnimation(); });
    div.select('.step-forward-control').on('click', function() { n3.stepAnimation(); });
  }
  
  // creates the time slider controls and defines attached events
  n3.prototype.createSliderControl = function() {
    var n3 = this;
    n3.domTarget.select('.controls').append('div').attr('class', 'slider-control-container').append('div').attr('class', 'slider');
  }

  // look up the coordinates for an edge given the time
  n3.prototype.getLineCoords = function(d, usearrows, start) {
    var n3 = this;

    var type = start ? 'startCoords' : 'coords';

    var startNode = d.inl[type];
    var endNode = d.outl[type];

    var x1 = n3.xScale(startNode.coord[0]);
    var y1 = n3.yScale(startNode.coord[1]);
    var x2 = n3.xScale(endNode.coord[0]);
    var y2 = n3.yScale(endNode.coord[1]);
    if(usearrows) {
      var radius = endNode.size * n3.baseNodeSize + 2;

      // Determine line lengths
      var xlen = x2 - x1;
      var ylen = y2 - y1;

      // Determine hypotenuse length
      var hlen = Math.sqrt(Math.pow(xlen,2) + Math.pow(ylen,2));

      // Determine the ratio between they shortened value and the full hypotenuse.
      var ratio = (hlen - radius) / hlen;
      var edgeX = x1 + (xlen * ratio);
      var edgeY = y1 + (ylen * ratio);
      
      //If the ratio is invalid, just use the original coordinates
      if (! $.isNumeric(ratio)) { 
        edgeX = x2;
        edgeY = y2;
      }
    } else {
      edgeX = x2;
      edgeY = y2;
    }
    return 'M '+x1+' '+y1+' L '+edgeX+' '+edgeY;
  }
 
  // load and process the JSON formatted data
  n3.prototype.loadData = function(graphData) {
    var n3 = this;
    n3.endAnimation();
    n3.currTime = 0;

    var processData = function(data) {
      console.time('loadData');
      n3.graph = data.network;
      n3.timeIndex = data.render;
      if (n3.options.dataChooser && ! $.isPlainObject(graphData)) {
        $(n3.domTarget.select('.data_chooser').node()).val(graphData);
        n3.domTarget.select('.video_link').attr('href', graphData.replace('.json', '.mp4'))
      }
      n3.container.selectAll('.edges, .labels, .nodes').selectAll('*').remove();

      n3.nodeCoords = {};

      $.each(n3.graph.val, function(i, n) {
        if (! $.isEmptyObject(n)) {
          n.id = i+1;
        }
        n3.nodeCoords[n.id] = {
          coord: [0,0],
          active: false,
          size: 0
        }
      })
      $.each(n3.graph.mel, function(i, e) {
        if (! $.isEmptyObject(e)) {
          e.id = i+1;
        }
      })
      var sliceInfo = n3.graph.gal['slice.par'];
      
      n3.minTime = sliceInfo.start[0];
      n3.maxTime = sliceInfo.end[0];
      n3.interval = sliceInfo.interval[0];
      var valIndex = {};
      $.each(n3.timeIndex, function(i, t){
        valIndex[t.start] = i;
        t.renderData = n3.generateSliceRenderData(i);
        delete t.data; //remove redundant data that we've stored in renderData
      })      

      n3.initScales();

      if(n3.options.slider) {
        var sliderDiv = n3.domTarget.select('.slider');

        sliderDiv.html('');

        n3.slider = d3.slider().axis(true).step(n3.interval);
        n3.slider.margin(35)
        n3.slider.min(n3.minTime)
        n3.slider.max(n3.maxTime+sliceInfo['aggregate.dur'][0])
        n3.slider.animate(n3.options.animationDuration)
        n3.slider.value(n3.minTime)
        n3.slider.interval(sliceInfo['aggregate.dur'][0])
        n3.slider.on('slide', function(ext, value) {
          //Check to see if event originated from slider control or elsewhere
          var event = d3.event;
          if (event.type == 'drag' || d3.select(event.target).classed('d3-slider')) {
            n3.endAnimation();
            var duration = n3.options.scrubDuration/Math.abs(n3.currTime-value);
            n3.animateGraph(n3.currTime, valIndex[value], duration, true);
          }
        })
        
        n3.slider.on('slideend', function() {
          n3.slider.animate(n3.options.animationDuration);
        })
        sliderDiv.on('mousedown', function(e) { 
          n3.slider.animate(n3.options.scrubDuration);
        })

        sliderDiv.call(n3.slider);
      }
      console.timeEnd('loadData');
      if (n3.options.animateOnLoad) {
        n3.playAnimation();
      } else {
        n3.drawGraph(n3.options.animationDuration);
      }
    };

    if($.isPlainObject(graphData)) {
      processData(graphData)
    } else {
      $.getJSON(graphData, function(data) {
        processData(data);
      });
    }
  }

  n3.prototype.generateSliceRenderData = function(time) {
    var n3 = this;

    var sliceRenderData = {
      graph: {},
      node: {},
      edge: {}
    };

    var data = n3.timeIndex[time].data;

    $.each(['graph', 'node', 'edge'], function(i, type) {
      var sourceList = [];
      if (type == 'graph') {
        sourceList = [n3.graph.gal];
      } else if (type == 'node') {
        sourceList = n3.graph.val;
      } else {
        sourceList = n3.graph.mel;
      }

      $.each(sourceList, function(i, item) {
        var id =0;
        var propertyIndex;
        var itemProperties = {};

        if (type != 'graph') {
          id = item.id;
          propertyIndex = data.active[type+'s'][id];
        }

        if (type == 'graph' || propertyIndex !== undefined) {
          itemProperties.id = id;
          $.each(ndtvProperties[type], function(property, def) {
            var lookup = propertyIndex;
            var value = def;

            //If the property list has only one value, we apply it to all items
            if(data[property] && data[property].length == 1) {
              lookup = 0;
            }
            if (data[property] && data[property][lookup] !== undefined) {
              value = data[property][lookup];
              if (value && (property == 'main' || property == 'xlab')) {
                value = value.split('\n');
              } else if (! value && property == 'coord') {
                console.log('missing coordinates for node '+id+ ' at time '+time+' ('+n3.timeIndex[time].start+'-'+n3.timeIndex[time].end+')');
                //console.log('valid time slices for node '+index+' are '+n3.graph.val[index].active.join(','))
                //console.log('filling in with last know position: '+value)
              }
            } else if (type == 'graph' && data[property]) { //graph properties get applied directly
              value = data[property];
            }
            itemProperties[property] = value;
          })

          if (type == 'edge') {
            $.each(['inl', 'outl'], function(i, direction) {
              itemProperties[direction] = {
                id: item[direction][0]
              }
            });      
          }
          if (type == 'graph') {
            sliceRenderData[type] = itemProperties;
          } else {
            sliceRenderData[type][id] = itemProperties;
          }        
        } else if (type == 'node') {
          n3.nodeCoords[id].active = false;
        }
      })
    })
    return sliceRenderData;
  }

  n3.prototype.updateSliceRenderData = function(time) {
    var n3 = this;

    var prevNodeCoords = $.extend({}, n3.nodeCoords);
    var data = n3.timeIndex[time].renderData;
    
    $.each(data.node, function(id, node){
      if (!node.coord) {
        node.renderCoord = n3.nodeCoords[id].coord;
      } else {
        node.renderCoord = node.coord;
      }
      n3.nodeCoords[id] = {
        coord: node.renderCoord,
        active: true,
        size: node['vertex.cex']
      }
    });
    $.each(data.edge, function(id, edge){
      $.each(['inl', 'outl'], function(i, direction){
        var nodeid = edge[direction].id;
        var prevCoords = prevNodeCoords[nodeid];
        var coords = n3.nodeCoords[nodeid] || prevCoords;
        edge[direction] = {
          id: nodeid,
          coords: coords,
          //If the node is newly active, use the current coordinates for the start values
          startCoords: ! prevCoords.active ? coords : prevCoords
        }
      })
    })
    return data;
  }

  n3.prototype.drawGraph = function(duration) {
    var n3 = this;

    var renderData = n3.updateSliceRenderData(n3.currTime);

    var edgeDuration = duration * n3.options.enterExitAnimationFactor;
    var nodeDuration = duration * (1-n3.options.enterExitAnimationFactor);

    $.each(['main', 'xlab'], function(i, type){
      var text = renderData.graph[type];
      var target = n3.domTarget.select('.'+type+' text');
      target.selectAll('*').remove();

      if (text) {
        $.each(text, function(i, t){
          target.append('tspan').attr({
            'dy': (i ? '1.2em' : 0),
            'x': 0,
          }).text(t);
        })
      }
    });

    n3.domTarget.select('.background').transition()
      .style({fill: renderData.graph['bg']});

    var showInfo = function(d) {
      if(! n3.selected || n3.selected.id !== d.id) {
        n3.selected = d;
        n3.moveTooltip();
      } else {
        n3.hideTooltip();
      }
    }
    
    //update selected item
    if (n3.selected) {
      n3.selected = n3.selected.inl ? renderData.edge[n3.selected.id] : renderData.node[n3.selected.id];
      if (! n3.selected) {
        n3.hideTooltip();
      } 
    }

    if (renderData.graph.usearrows) {
      var markers = n3.domTarget.select('defs').selectAll('.arrowhead').data(d3.values(renderData.edge), function(e) { return e.id})
        markers.enter().append('marker').attr({
          id: function(d) { return 'arrowhead_'+d.id; },
          class: 'arrowhead',
          viewBox: "0 -5 10 10",
          refX: 7,
          refY: 0,
          markerWidth: 6,
          markerHeight: 6,
          markerUnits: "strokeWidth",
          orient: "auto",
        })
        .append("svg:path")
          .attr({
            d: "M0,-5L10,0L0,5",
            fill: 'green'
          });

        markers.selectAll('path').transition()
          .delay(edgeDuration)
          .duration(nodeDuration)
          .attr({
            fill: function(d) { return d['edge.col']; }
          })

        markers.exit().selectAll('path')
          .attr({
            fill: 'red'
          })
        
        markers.exit().transition()
          .delay(edgeDuration)
          .duration(nodeDuration)
          .remove()
    }

    var lines = n3.container.select('.edges').selectAll('.edge').data(d3.values(renderData.edge), function(e) { return e.id})
      lines.enter().append('path')
        .attr({
          class: function(d) { return 'edge edge_'+d.id+' '+(d['edge.css.class'] || ''); },     
          d: function(d) {return n3.getLineCoords(d, renderData.graph.usearrows, 1);  },
          opacity: 0,
          "marker-end": function(d) { if(renderData.graph.usearrows) { return "url(#arrowhead_"+d.id+")"; }}
        })
        .style({
          'stroke': 'green',
          'stroke-width': function(d) { return d['edge.lwd']; }
        })
        .on('click', showInfo)
        .transition()
        .duration(edgeDuration)
        .attr({opacity: 1})
       
      // lines.transition()
      //   .delay(edgeDuration-6)
      //   .duration(0)
      lines.exit()
        .style('stroke', 'red')
        .transition()
        .duration(edgeDuration)
        .attr('opacity', 0)          
        .remove();

      lines.transition()
        .delay(edgeDuration)
        .duration(nodeDuration)
        .attr({
          d: function(d) {return n3.getLineCoords(d, renderData.graph.usearrows);  },
          opacity: 1
        })
        .style({
          'stroke': function(d) { return d['edge.col']},
          'stroke-width': function(d) { return d['edge.lwd']; },
        })

    var styleNodes = function(selection) {
      selection.style({
        'fill': function(d, i) {return d['vertex.col']; },
        'stroke-width': function(d) {return d['vertex.lwd']; },
        'stroke': function(d) {return d['vertex.border']; },
      })
      selection.filter('circle').call(n3.drawCircleNode)
      selection.filter('path').call(n3.drawPolygonNode)
    }

    var createNodes = function(selection) {
      selection
        .attr({
          class: function(d) { return 'node node_'+d.id+' '+(d['vertex.css.class'] || ''); },
          opacity: 0,
        })
        .call(styleNodes)
        .on('click', showInfo)
        .transition()
        .duration(edgeDuration)
        .attr('opacity', 1)
    }

    var nodes = n3.container.select('.nodes').selectAll('.node').data(d3.values(renderData.node), function(e) { return e.id; })
      var node_groups = nodes.enter().append('g');
      node_groups.filter(function(d) { return d['vertex.sides'] != 50; }).append('path').call(createNodes);
      node_groups.filter(function(d) { return d['vertex.sides'] == 50; }).append('circle').call(createNodes);

      nodes.filter('.node').transition()
        .delay(edgeDuration)
        .duration(nodeDuration)
        .attr({
          opacity: 1
        }).call(styleNodes)

      nodes.exit()
        .transition()
        .duration(edgeDuration)
        .attr('opacity', 0)
        .remove(); 

    var labels = n3.container.select('.labels').selectAll('text').data(d3.values(renderData.node), function(e) { return e.id});
      labels.enter().append('text').filter(function(d) { return renderData.displaylabels !== false; })
        .attr({
          class: function(d) { return 'label label_'+d.id+ ' '+ (d['vertex.label.css.class'] || ''); },
          x: function(d, i) { return n3.xScale(d.renderCoord[0])+n3.options.labelOffset.x; },
          y: function(d, i) { return n3.yScale(d.renderCoord[1])+n3.options.labelOffset.y; },
          opacity: 0
        })
        .text(function(d, i) { return d.label; })
        .style({
          'fill': function(d) {return d['label.col']; },
        })
        .transition()
        .duration(edgeDuration)
        .attr('opacity', 1)

      labels.transition().filter(function(d) { return renderData.graph.displaylabels !== false; })
        .delay(edgeDuration)
        .duration(nodeDuration)
        .attr({
          x: function(d, i) { return n3.xScale(d.renderCoord[0])+n3.options.labelOffset.x; },
          y: function(d, i) { return n3.yScale(d.renderCoord[1])+n3.options.labelOffset.y; },
          opacity: 1
        })
        .text(function(d, i) { return d.label; })
        .style({
          'fill': function(d) {return d['label.col']; },
        })

      labels.exit()
        .transition()
        .duration(edgeDuration)
        .attr('opacity', 0)
        .remove();
  
      var count = 0;
      var tooltipThrottle = 50;
      var translateTooltip = function() {
        n3.moveTooltip();
        count += tooltipThrottle;
        if ( count <= duration+tooltipThrottle) {
          setTimeout(translateTooltip, tooltipThrottle);
        }
      }
      translateTooltip();
  }

  n3.prototype.resizeGraph = function() {
    var n3 = this;
    n3.initScales();

    var lines = n3.container.select('.edges').selectAll('.edge')
      .attr({
        d: function(d) {return n3.getLineCoords(d, n3.timeIndex[n3.currTime].renderData.graph.usearrows);  },
      });

    n3.container.selectAll('circle.node').call(n3.drawCircleNode)
    n3.container.selectAll('path.node').call(n3.drawPolygonNode)

    var labels = n3.container.select('.labels').selectAll('text')
      .attr({
        x: function(d, i) { return n3.xScale(d.renderCoord[0])+n3.options.labelOffset.x; },
        y: function(d, i) { return n3.yScale(d.renderCoord[1])+n3.options.labelOffset.y; },
      })

    n3.moveTooltip();
    //redraw the slider control 
    if (n3.options.slider) {
      var sliderDiv = n3.domTarget.select('.slider');
      sliderDiv.html('');
      sliderDiv.call(n3.slider);
    } 
  }
  
  // function to 'play' animation or jump to a specific point in time
  n3.prototype.animateGraph = function(time, endTime, duration, noUpdate) {
    var n3 = this;
    if (time > n3.timeIndex.length -1 || time < 0) { return; }

    duration = duration === undefined ? n3.options.animationDuration : duration;
    endTime = endTime === undefined ? n3.timeIndex.length -1 : endTime;
    var nextTime;
    if (time == endTime) {
      nextTime = time;
    } else if (endTime > time) {
      nextTime = time +1;
    } else {
      nextTime = time -1;
    }

    n3.currTime = time == n3.currTime ? nextTime : time;
    //console.log(n3.currTime + ' '+time+' '+endTime+ ' '+nextTime+ ' '+n3.prevTime)
    if(! noUpdate && n3.options.slider) {
      n3.slider.value(n3.timeIndex[n3.currTime].start[0]);
    }
    n3.drawGraph(duration);
    if (n3.currTime != endTime) {
      n3.animate = setTimeout(function(){
        n3.animateGraph(nextTime, endTime, duration, noUpdate);
      }, duration)
    }
  }

  n3.prototype.moveTooltip = function() {
    var n3 = this;
    if (n3.selected) {
      var type = n3.selected.inl ? 'edge' : 'node';
      var nodeDOM = n3.container.select('.'+type+'_'+n3.selected.id).node();
      if (!nodeDOM) {
        n3.hideTooltip();
      } else {
        var coords = nodeDOM.getBoundingClientRect();
        var offset = $(n3.domTarget.node()).position();
        var top = coords.top - offset.top-30;
        var left = coords.right - offset.left;
        var property = 'vertex.tooltip';
        if (type == 'edge') {
          top += coords.height/2;
          left -= coords.width/2;
          property = 'edge.tooltip';
        }
        var html = n3.selected[property] || type+" id: "+n3.selected.id;
        n3.tooltip.style({
          display: 'block',
          top: top+'px', //FIXME - need to offset by rendered height
          left: left+'px',
        }).html(html)
      }
    }
  }

  n3.prototype.hideTooltip = function() {
    var n3 = this;
    n3.selected = null;
    n3.tooltip.style('display', 'none');
  }

  n3.prototype.endAnimation = function(noHalt){
    var n3 = this;
    clearTimeout(n3.animate);
    if (! noHalt) {
      n3.domTarget.selectAll('.node, .edge, .label, .d3-slider-handle').transition().duration(0)
    }
  }

  n3.prototype.stepAnimation = function(reverse) {
    var n3 = this;

    n3.endAnimation(1);
    if (reverse) {
      n3.animateGraph(n3.currTime-1, n3.currTime-1); 
    } else {
      n3.animateGraph(n3.currTime+1, n3.currTime+1); 
    }
  }

  n3.prototype.playAnimation = function(reverse) {
    var n3 = this;

    n3.endAnimation(1);
    if (reverse) { 
      n3.animateGraph(n3.currTime-1, 0); 
    } else {
      n3.animateGraph(n3.currTime+1); 
    }
  }
  return n3;
}));
