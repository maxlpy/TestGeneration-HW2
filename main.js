var esprima = require("esprima");
var options = {tokens:true, tolerant: true, loc: true, range: true };
var faker = require("faker");
var fs = require("fs");
faker.locale = "en";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var value = new Random(Random.engines.mt19937().autoSeed());

function main()
{
	var args = process.argv.slice(2);

	if( args.length == 0 )
	{
		args = ["subject.js"];
	}
	var filePath = args[0];

	constraints(filePath);
//	fakeDemo();
	generateTestCases();
}


function fakeDemo()
{
	console.log( faker.phone.phoneNumber() );
	console.log( faker.phone.phoneNumberFormat() );
	console.log( faker.phone.phoneFormats() );
}

var functionConstraints =
{
}

var mockFileLibrary = 
{
	pathExists:
	{
		'path/fileExists': {}
	},
	fileWithContent:
	{
		pathContent: 
		{	
  			file1: 'text content',
		}
	},
	buf:
	{
		pathContent: 
		{	
			file1: '',
		}
	}
};

function generateTestCases()
{

	var content = "var subject = require('./subject.js')\nvar mock = require('mock-fs');\n";
	for ( var funcName in functionConstraints )
	{
		var params = {};
		// initialize params
		for (var i =0; i < functionConstraints[funcName].params.length; i++ )
		{
			var paramName = functionConstraints[funcName].params[i];
//			params[paramName] = '\'' + faker.phone.phoneNumber()+'\'';
			params[paramName] = '\'\'';
		}

		// update parameter values based on known constraints.
		var constraints = functionConstraints[funcName].constraints;
		// Handle global constraints...
		var fileWithContent = _.some(constraints, {mocking: 'fileWithContent' });
		var buf = _.some(constraints, {mocking: 'buf' });
		var pathExists      = _.some(constraints, {mocking: 'fileExists' });

		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				params[constraint.ident] = constraint.value;
			}
		}

		// Prepare function arguments.
		var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
		if( pathExists || fileWithContent || buf )
		{
			content += generateMockFsTestCases(pathExists,fileWithContent,buf,funcName, args);
			// Bonus...generate constraint variations test cases....
			content += generateMockFsTestCases(pathExists,fileWithContent,buf,funcName, args);
			content += generateMockFsTestCases(pathExists,fileWithContent,!buf,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,buf,funcName, args);
			content += generateMockFsTestCases(!pathExists,fileWithContent,buf,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,!buf,funcName, args);
			content += generateMockFsTestCases(!pathExists,fileWithContent,!buf,funcName, args);
			content += generateMockFsTestCases(!pathExists,!fileWithContent,!buf,funcName, args);
		}
		else
		{
			// Emit simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
		}
		
		for( var c = 0; c < constraints.length; c++ )
		{
			var constraint = constraints[c];
			if( params.hasOwnProperty( constraint.ident ) )
			{
				params[constraint.ident] = constraint.inverse || constraint.value;
			}
		}

		// Prepare function arguments.
		var args = Object.keys(params).map( function(k) {return params[k]; }).join(",");
		if( pathExists || fileWithContent || buf )
		{
			content += generateMockFsTestCases(pathExists,fileWithContent,buf,funcName, args);
			// Bonus...generate constraint variations test cases....
			content += generateMockFsTestCases(pathExists,fileWithContent,buf,funcName, args);
			content += generateMockFsTestCases(pathExists,fileWithContent,!buf,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,buf,funcName, args);
			content += generateMockFsTestCases(!pathExists,fileWithContent,buf,funcName, args);
			content += generateMockFsTestCases(pathExists,!fileWithContent,!buf,funcName, args);
			content += generateMockFsTestCases(!pathExists,fileWithContent,!buf,funcName, args);
			content += generateMockFsTestCases(!pathExists,!fileWithContent,!buf,funcName, args);
		}
		else
		{
			// Emit simple test case.
			content += "subject.{0}({1});\n".format(funcName, args );
		}
	}
	fs.writeFileSync('test.js', content, "utf8");
}

function generateMockFsTestCases (pathExists,fileWithContent,buf,funcName,args) 
{
	var testCase = "";
	// Insert mock data based on constraints.
	var mergedFS = {};
	if( pathExists )
	{
		for (var attrname in mockFileLibrary.pathExists) { mergedFS[attrname] = mockFileLibrary.pathExists[attrname]; }
	}
	if( fileWithContent )
	{
		for (var attrname in mockFileLibrary.fileWithContent) { mergedFS[attrname] = mockFileLibrary.fileWithContent[attrname]; }
	}
	if( buf )
	{
		for (var attrname in mockFileLibrary.buf) { mergedFS[attrname] = mockFileLibrary.buf[attrname]; }
	}

	testCase += 
	"mock(" +
		JSON.stringify(mergedFS)
		+
	");\n";

	testCase += "\tsubject.{0}({1});\n".format(funcName, args );
	testCase+="mock.restore();\n";
	return testCase;
}

function constraints(filePath)
{
   var buf = fs.readFileSync(filePath, "utf8");
	var result = esprima.parse(buf, options);

	traverse(result, function (node) 
	{
		if (node.type === 'FunctionDeclaration') 
		{
			var funcName = functionName(node);
			console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName ));

			var params = node.params.map(function(p) {return p.name});

			functionConstraints[funcName] = {constraints:[], params: params};

			// Check for expressions using argument.
			traverse(node, function(child)
			{
				
				if( child.type === 'BinaryExpression' && child.operator == "==")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						var rightHand = buf.substring(child.right.range[0], child.right.range[1]);
						functionConstraints[funcName].constraints.push( 
						{
							ident: child.left.name,
							value: rightHand, 
							inverse: value.integer(1, 100)
						});                            
 
					} else if(child.left.type == 'Identifier' && child.right.type == 'Literal') {
						var num = "1234567890";
						var phoneNum1 = child.right.value + value.string(7, num);
						var phoneNum2 = parseInt(child.right.value) + 1 + value.string(7, num);
						functionConstraints[funcName].constraints.push( 
						{
							ident: params[0],
							value: JSON.stringify(phoneNum1),
							inverse: JSON.stringify(phoneNum2)
						});
					}
				}
				
				if( child.type === 'BinaryExpression' && child.operator == "<")
				{
					if( child.left.type == 'Identifier' && params.indexOf( child.left.name ) > -1)
					{
						var expression = buf.substring(child.right.range[0], child.right.range[1]);
						functionConstraints[funcName].constraints.push( 
						{
							ident: child.left.name,
							value: value.integer(expression - 100, expression - 1), 
							inverse: expression 
						});
					}
				}
				
				if( child.type === 'LogicalExpression' && child.operator == "||")
                {
                        if(child.right.argument.type == 'MemberExpression')
                        {
                                var propName = child.right.argument.property.name;
                                var trueObj = {};
                                trueObj[propName] = true;
                                var falseObj = {};
                                falseObj[propName] = false;
								functionConstraints[funcName].constraints.push( 
								{
									ident: child.right.argument.object.name,
									value: JSON.stringify(falseObj), 
									inverse: JSON.stringify(trueObj) 
								});

                        }
                }

				if( child.type == "CallExpression" && 
					 child.callee.property &&
					 child.callee.property.name =="readFileSync" )
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'pathContent/file1'",
								mocking: 'fileWithContent'
							});
						}
					}
				}

				if( child.type == "CallExpression" &&
					 child.callee.property &&
					 child.callee.property.name =="existsSync")
				{
					for( var p =0; p < params.length; p++ )
					{
						if( child.arguments[0].name == params[p] )
						{
							functionConstraints[funcName].constraints.push( 
							{
								// A fake path to a file
								ident: params[p],
								value: "'path/fileExists'",
								mocking: 'fileExists'
							});
						}
					}
				}

			});

			console.log( functionConstraints[funcName]);

		}
	});
}

function traverse(object, visitor) 
{
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor)
{
    var key, child;

    if( visitor.call(null, object) )
    {
	    for (key in object) {
	        if (object.hasOwnProperty(key)) {
	            child = object[key];
	            if (typeof child === 'object' && child !== null) {
	                traverseWithCancel(child, visitor);
	            }
	        }
	    }
 	 }
}

function functionName( node )
{
	if( node.id )
	{
		return node.id.name;
	}
	return "";
}
//
//
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

main();