var http = require("http"),
	net  = require("net"),
	fs = require("fs");

var substr = function(str, start, end) {
	var length = end<0?str.length+end-start:end-start;
	return [].splice.call(str, start, length).join("");
};
var clients = [];
var files = {
	recursive_includes_parser: function(content, data, cb) {
		// include: @include<file.ext, {data: content}>
		var include = /@include\<([^>,]+), ([^>]+)\>/;
		var finished = true;
		content.replace(include, function(m, a, b) {	
			finished = false;		
			files.serve_file(a, function(html) {	
				// with parsed content, put it in place and parse again
				files.recursive_includes_parser(content.replace(m, html), data, cb);
			}, JSON.parse(b));
		});
		// if there was nothing to replace, this is the finished content
		finished && cb(content, data);
	},
	parse_html_file: function(content, data) {
		data = data || {};
		var parse = function(context) {
			return content.replace(/\$\{([^}]+)\}/g, function($0, $1) {
				with(context)
				return eval($1);
			});
		};
		var group;
		var resp = higher_order.apply_to_potential_children(data, parse, function(coll) {
			group = coll;
		});
		return group ? resp.join("") : resp;
	}, 
	serve_file: function(file, output, params) {
		var parseOut = higher_order.application_chain(output, files.parse_html_file);
		return new View(file, params).render(function(html) {
			files.recursive_includes_parser(html, params, parseOut);
		});
	}
};
var server = {
	listen: function(port, cb, ip) {
		ip = ip||'127.0.0.1';
		console.log('Server running at http://'+ip+':'+port+'/');	
		return http.createServer(cb).listen(port, ip);		
	}, 
	live : function(port, cb, ip) {
		ip = ip||'127.0.0.1';
		console.log('Socket running at http://'+ip+':'+port+'/');	
		return net.createServer(cb).listen(port, ip);	
	},
	REST: function(method, api, req, callback, reqres) {	
		//TODO: can't parse subsequent vars
		var url = req.url;		
		if( method.filter && 
			!method.filter(higher_order.is_equal_to(req.method)).length ) 
			return;
		else if ( method != req.method )
			return;
		//the pattern used by this API
		var fire_if_applicable = function(api) {
			var pattern = api.replace(/\/:[^\/]+\//g, "\/[^\\\/]+\/");
			if( (new RegExp("^"+pattern+"$", "g")).test(url) ) {
				// It's a matching request
				var keys = api.match(/\/(.*?)\//g);
				var vals = url.match(/\/(.*?)\//g);
				var data = {};
				// Cycle through slashed data
				keys.map(function(key, index) {
					var restful = key.match(/\/:[^\/]+\//);
					// if this was meant to carry data, save it
					if( restful && (restful = restful[0]) ) {
						var key = substr(restful, 2, -1);
						data[key] = substr(vals[index], 1, -1);
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
var Model = function(data) {
	data.__proto__.find = function(criteria) {
		return this.filter(function(item) {
			var resp = true;
			for( var k in criteria )
				resp = resp && item[k] == criteria[k];
			return resp;
		});
	};
	return data;
};
var View = function(files, dataSet) {
	//read all files and render data
	dataSet = dataSet || {};
	var cache = [];
	var isCollection = false;	//there are multiple files as choices
	this.content = files;
	this.data = dataSet;			
	this.render = function(render) {	
		var read_file = function(file) {
			fs.readFile(file, 'utf8', function(error, data) {
				if( error ) return;				
				if( dataSet.filter ) {
					//filter out data points for other files
					dataSet.filter(function(data_point) {
						return (isCollection && file != data_point.__tmpl__);
					});
				}
				render(data, dataSet);					
			});
		};					
		higher_order.apply_to_potential_children(files, read_file, function(coll) {
			isCollection = coll;
		});				
	};
};
var higher_order = {
	apply_to_potential_children: function(data, f, group_cb) {
		group_cb && group_cb(!!data.map);
		if( data.map ) {	//various files			
			return data.map(f);
		} else {
			return f(data);			
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
	}
};

// collapse them
[files, server, sockets, higher_order, {
	Model: Model, View: View
}].map(function(a) {
	for( var k in a ) exports[k] = a[k];
});