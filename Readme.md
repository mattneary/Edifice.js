Edifice.js
==========
- An open-ended library for extremely simple `html` templating based on `RESTful URLs` that gets rid of boiler-plate code.
- Templating allows for inline javascript (`${...}`) and file importing (`@include<file.html, {}>`)
- Includes various high order functions to keep code clean, e.g., 

		edifice.REST("GET", "/users/:id/", req, edifice.application_chain(
			edifice.method_call(res, "end"), 
			JSON.stringify,
			edifice.method_call(users, "find")
		));

Introduction
============

	http.createServer(function(req, res) {
		if( req.method == "GET" ) {
			switch( req.url ) {
				case "/home/":  
					fs.readFile("index.html", 'utf8', function(error, data) {
						res.write(data);
						res.end();			
					});
					break;
				//...
			}
		}
	}).listen("8080");

Goes to:

	(function($) {
		$.listen("8080", function(req, res) {
			$.REST("GET", "/home/", req, function() {
				$.serve_file("index.html", $.method_call(res, "end"));
			});
			//...
		});
	})(edifice);

The more complicated problems are where `edifice` really simplifies your code, but this code still shows off some of the best features of `edifice`. The `REST` function let's you handle `RESTful URLs` in a single function call, with parameters passed to the callback; `serve_file` reads a file to a callback, with template data as an optional third parameter; `method_call` allows an object's method to be passed as a callback to a function.

RESTful Requests
================

- **edifice.listen: function(port, callback(req,res)) {}**
	
	Call this to delegate requests to handlers for different `URLs` and `methods`. For example:
	
		edifice.listen("1337", function(req, res) {
			switch( req.url ) {
				//...
			}
		})

- **edifice.REST(method(s), pattern, request, callback(params))**
	
	Specify method(s) to accept, a `RESTful` pattern to match, the current `request` and a callback to handle requests. For example:
	
		edifice.REST("GET", "/posts/:id/", req, function(data) {
			var user = users.find({
				"id": data.id
			});
			res.write(JSON.stringify(user));
			res.end();
		})

	Here's an example of the simplification that's possible with Edifice's builtin higher order functions:
	
		edifice.REST("GET", "/posts/:id/", req, edifice.application_chain(
			edifice.method_call(res, "end"),
			JSON.stringify, 
			edifice.method_call(users, "find")
		));

- To handle multiple methods, pass an array as `methods`. For example:

		edifice.REST(["GET", "POST"], "/posts/:id/", req, edifice.application_chain(
			edifice.method_call(res, "end"),
			JSON.stringify, 
			edifice.method_call(users, "find")
		));		

- To maintain access to `req` and `res` outside of the `listening` closure, pass a dictionary `{req:req, res:res}` as a last parameter to `edifice.REST` and `req` and `res` will be sent as parameters to the callback. For example:

		var handler = function(req, res, params) {
			edifice.serve_file(
				"index.html",
				edifice.method_call(res, "end")
			);
		};
		edifice.listen("8080", function(req, res) {
			edifice.REST("GET", "/home/", req, handler, {
				req: req,
				res: res
			});
		});

Templating
==========

- Include inline `javascript` in `template` files within `${...}` sequences.
- Import another file into a `template` file with `@include<file.html, data>`. For example:

		@include<file.html, {
			"title": "Hello, World"
		}>		

- **edifice.serve_file(filename(s), cb, data_point(s))**
	
	Serve parsed `template` files with specified `filename` and `data` and output them with a callback function. For example:
	
		edifice.serve_file("file.html", function(html) {
			res.write(html);
			res.end();
		}, {
			"title": "Hello, World"
		});		

	To use __multiple__ `template` files pass an array as the `data` and for each child `object` specify a `__tmpl__` attribute as the filename to use. Additionally, pass an array of filenames as the `files`. For example:

		edifice.serve_file(["text.html", "image.html"], edifice.method_call(res, "end"), [{
			"title": "Hello, World",
			"__tmpl__": "text.html"
		}, {
			"title": "The Beach",
			"__tmpl__": "image.html"
		}]);	

- To simplify the process of serving multiple data points a value of each `object` can often be `mapped` to it's template file. for example:

		var data = posts.map(edifice.copy_attribute(
			"type", "__tmpl__", 
			edifice.appender(".html")
		));
		edifice.serve_file(
			["text.html", "image.html"],
		 	edifice.method_call(res, "end"),
		 	data		 	
		);

Functional Utilities
====================
- **apply_to_potential_children: function(data, f, group_cb) {}**

	Either call `f(data)` or map `data` to `f` if it's an array. Fires `group_cb` with whether or not it's mapped.

- **application_chain: function(*functions...*) {}**

	Perform a `function` composition of a series of `functions` and receive a single `function`. In math notation, `(f•g•...)(x,y,...)`

- **partial_application: function(f, range) {}**

	Splice the passed arguments to only pass certain parameters. Useful for masking the extra parameters in `map`. e.g., 
	
		nums.map(partial_application(parseInt, [0, 1]))
	

- **method_call: function(obj, key) {}**

	Equivalent to `obj[key]` but solves the issue of aliasing a function dependent on `this`. For example:
		
		words.map(edifice.method_call(res, "write"));

- **is_equal_to: function(constant) {}**

	Test equivalence to a constant. Useful with `filter`.

- **copy_attribute: function(attr_a, attr_b, mapper) {}**

	Copy the value of one attribute to another. Optionally filter value a with a callback `mapper`. Useful with `map`.

- **prepender: function(constant) {}** or **appender: function(constant) {}**

	Prepend or append a constant to an item. Useful with `map`.