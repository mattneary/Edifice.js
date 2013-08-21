var http = require("http"),
	net  = require("net"),
	fs = require("fs"),
	mongoose = require("./mongoose");

var substr = function(str, start, end) {
	var length = end<=0?str.length+end-start:end-start;
	return [].splice.call(str, start, length).join("");
};
var clients = [];
var files = {	
	load_parser: function(content, cb) {
		var load = /@load\{([^},]+)\}/;
		var finished = true;
		content.replace(load, function(m, link) {
			finished = false;			
			var buffer = "";
			var cache = function(chunk) {
				return buffer += chunk;
			}
			
			http.get({
				host:'localhost', 
				port:8080, 
				path:link, 
				agent:false
			}, function(r) {
				r.on("data", cache);
				r.on("end", function() {
					files.load_parser(content.replace(m, buffer), cb);
				})
			});
		});
		finished && cb(content);
	},
	parse_html_file: function(content, data) {
		data = data || {};
		var parse = function(context) {
			return {content: content.replace(/\$\{([^}]+)\}/g, function($0, $1) {
					with(context.content||{})
					return eval($1);
				}), index: context.index
			};
		};
		var resp = higher_order.apply_to_potential_children(data, parse);
		return resp;
	}, 
	serve_file: function(file, output, params) {	
		var buffer = [];
		var cache = function(resp) {
			// resp will be all of the parses for a given file
			return higher_order.apply_to_potential_children(resp, function(el) {
				// put them in their correct order as they arrive
				buffer[el.index] = el.content;
				return el.content;
			});
		};
		var parseOut = higher_order.application_chain(cache, files.parse_html_file);		
		var parseEnd = higher_order.application_chain(higher_order.argument_filter(0, cache, function(resp) {
			// cache the first param then fire this callback
			output(buffer.length>1 ? buffer.join("") : resp);
		}), files.parse_html_file);		
		return new View(file, params).render(function(c, d, l) {
			// fire either parser but with data as an additional parameter
			files.load_parser(c, higher_order.parameter_appender(l?parseEnd:parseOut, d));
		});
	}
};
var server = {
	listen: function(port, cb, ip) {
		ip = ip||'127.0.0.1';
		console.log('Server running at http://'+ip+':'+port+'/');	
		return http.createServer(higher_order.parameter_appender(cb, exports)).listen(port, ip);		
	}, 
	live : function(port, cb, ip) {
		ip = ip||'127.0.0.1';
		console.log('Socket running at http://'+ip+':'+port+'/');	
		return net.createServer(higher_order.parameter_appender(cb, exports)).listen(port, ip);	
	},
	REST: function(method, api, req, callback, reqres) {	
		//TODO: can't parse subsequent vars
		//TODO: can't begin with a constant
		var url = req.url;		
		if( method.filter && 
			!method.filter(higher_order.is_equal_to(req.method)).length ) 
			return;
		else if ( method != req.method )
			return;
		//the pattern used by this API
		var fire_if_applicable = function(api) {
			var pattern = api.replace(/\/:[^\/]+\//g, "\/[^\\/]+\/");
			if( (new RegExp("^"+pattern+"?$", "g")).test(url) ) {
				// It's a matching request
				var keys = api.match(/\/[^\/]+/g);
				var vals = url.match(/\/[^\/]+/g);
				var data = {};
				// Cycle through slashed data
				keys.map(function(key, index) {
					var restful = key.match(/\/:[^\/]+/);
					// if this was meant to carry data, save it
					if( restful && (restful = restful[0]) ) {
						var key = substr(restful, 2, 0);
						data[key] = substr(vals[index], 1, 0);
					}
				});
				// allow for out of closure callbacks
				if( reqres ) callback(reqres[req], reqres[res], data);
				else callback(data);
			}
		};
		// cycle through api's to see if it's a match
		higher_order.apply_to_potential_children(api, fire_if_applicable);
	} 
};
var sockets = {
	broadcast: function(message, sender, clients) {
		clients && clients.map(function(client) {
			client !== sender && client.write(message);
		});
	}, 
	unregister_socket: function(socket) {
		clients.splice(clients.indexOf(socket), 1);				
	}, 
	register_socket: function(socket) {
		socket.name = socket.remoteAddress+":"+socket.remotePort;
		clients.push(socket);
	}, 
	register_perishable_socket: function(socket) {
		register_socket(socket);
		socket.on("end", function() {
			unregister_socket(socket);
		});
	}
};
var Model = function(name, schema, url) {	
	var Schema = mongoose.Schema
	  , ObjectId = Schema.ObjectId;
	var mongoUri = url || 'mongodb://localhost:27017/test'; 
	mongoose.connect(mongoUri);	
	
	var Schema = mongoose.Schema
	  , ObjectId = Schema.ObjectId;
	
	var Post = new Schema(schema);
	var Posts = mongoose.model(name, Post);
	return Posts;
};
var View = function(files, dataSet) {
	//read all files and render data
	dataSet = dataSet || {};
	var cache = [];
	var isCollection = false;	//there are multiple files as choices
	this.content = files;
	this.data = dataSet;			
	this.render = function(render) {	
		var read_file = function(file, isLast) {
			fs.readFile(file, 'utf8', function(error, data) {
				var copy_dataSet = dataSet;
				if( error ) return;				
				if( dataSet.filter ) {
					//filter out data points for other files
					copy_dataSet = copy_dataSet.map(function(el, index) {
						return {
							content: el,
							index: index
						}
					});	
					copy_dataSet = copy_dataSet.filter(function(data_point) {
						return (isCollection && file == data_point.content.__tmpl__);
					});
				}
				render(data, copy_dataSet, isLast);					
			});
		};					
		higher_order.apply_to_potential_children(files, read_file, function(coll) {
			isCollection = coll;
		});				
	};
};
var higher_order = {
	apply_to_potential_children: function(data, f, group_cb, isLast) {
		group_cb && group_cb(!!data.map);
		if( data.map ) {	//various files			
			return data.map(function(el, i) { return f(el, data.length-1==i) });
		} else {
			return f(data, true);			
		}
	},
	application_chain: function(/*functions*/) {
		return [].reduce.call(arguments, function(f, g) {
			return function() {
				return f(g.apply(this, arguments));
			}
		});
	},
	partial_application: function(f, range) {
		//range ex. [0,3]
		return function(/*arguments*/) {
			return f.apply(this, [].splice.apply(arguments, range));
		};
	},
	method_call: function(obj, key) {
		return function(/*arguments*/) {
			obj[key].apply(obj, arguments);
		};
	},
	is_equal_to: function(constant) {
		return function(val) {
			return val == constant;
		}
	},
	copy_attribute: function(a, b, mapper) {
		return function(item) {
			item[b] = mapper ? mapper(item[a]) : item[a];
			return item;
		};
	},
	prepender: function(constant) {
		return function(val) {
			return constant+val;
		}
	},
	appender: function(constant) {
		return function(val) {
			return val+constant;
		}
	},
	argument_filter: function(index, filter, cb) {
		return function(/*arguments*/) {
			var args = arguments;
			args[index] = filter(args[index]);
			cb.apply(this, args);
		}
	},
	property_default: function(property, def) {
		return function(item) {
			item[property] = item[property] || def;
			return item;
		}
	},
	switcher: function(/*states*/) {
		//DOCS: __default__ at bottom, please
		var args = arguments;
		return function(val) {	
			for(var k in args) {
				var state = args[k];
				if( val == state[0] ) {					
					val = state[1];
					break;
				} else if( state[0] == "__default__" ) val = state[1];
			};
			return val;
		}
	},
	parameter_appender: function(cb /*, additional args*/) {
		var additional = [].splice.call(arguments, 1);
		return function(/*normal args*/) {
			var combo = [];
			[].map.call(arguments, function(v){combo.push(v)});
			cb.apply(this, combo.concat(additional));
		};
	},
	call_with_arguments: function(f /*, args*/) {
		var args = [].splice.call(arguments, 1);
		return function() {
			f.apply(this, args);
		};
	}
};

// collapse them
[files, server, sockets, higher_order, {
	Model: Model, View: View
}].map(function(a) {
	for( var k in a ) exports[k] = a[k];
});