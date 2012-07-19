console.log("Loading voice2code.js ... No errors!");

var voice2code = {
  states: {
    GLOBAL: 0,
    IN_LOOP: 1,
    IN_CONDITIONAL: 2
  }
};

var spoken_code    = [], // List of vocal instructions used to generate the code
    generated_code = [], // List of instructions generated from vocals
    code_metadata  = [], // Metadata available for each instruction
    program_vars   = []; // An array of used variables in the program

var input_state = [voice2code.states.GLOBAL]; // Last state = newest

// Language grammar -- will be refactored into its own file/format later
function process_speech_input(line) {
  console.log("Processing: " + line);

  var result = [];

  // Command: run the code
  result = line.match(/run the code/);
  if (result != null && result.length > 0) {
    run_code();
  }

  // For loop
  result = line.match(/loop from (\d+) to (\d+)/i);
  if (result != null && result.length > 0) {
    var start = result[1],
        end   = result[2];

    var iterator = random_variable();
    g_code = "for (" + iterator + " = " + start + "; " + iterator
      + " <= " + end + "; " + iterator + "++) { {{loop_body}} }";
    s_code = "loop from " + start + " to " + end;
    metadata = {type: "loop", iterator: iterator};

    append_instruction(g_code, s_code, metadata);

    // Push new state AFTER instructions
    input_state.push(voice2code.states.IN_LOOP);
  }
  
  // Assignment operator
  result = line.match(/set ([\s\w]+) equal to (\d+)/i);
  if (result != null && result.length > 0) {
    var variable = result[1].replace(' ', '_'),
        value    = result[2];

    metadata = {type: "assignment", variable: variable, value: value};
    g_code = variable + " = " + value + ";";
    s_code = "set " + result[1] + " equal to " + value;

    program_vars.push(variable);

    append_instruction(g_code, s_code, metadata);
  }

  // Addition
  result = line.match(/add ([\s\w\d]+) to ([\s\w]+)/i);
  if (result != null && result.length > 0) {
    var value_delta        = result[1].replace(' ', '_'),
        accepting_variable = result[2].replace(' ', '_');

    if (value_delta === "the_number") {
      value_delta = "{{iterator}}";
    }

    metadata = {type: "addition", 
                variable: accepting_variable, 
                delta: value_delta};
    g_code   = accepting_variable + " += " + value_delta + ";";
    s_code   = "add " + value_delta + " to " + accepting_variable;

    append_instruction(g_code, s_code, metadata);
  }

  // If statement with modulus (lol)
  result = line.match(/if ([\s\w\d]+) is divisible by ([\s\w\d]+)/i);
  if (result != null && result.length > 0) {
    var variable = result[1].replace(' ', '_'),
        operand  = result[2].replace(' ', '_');

    if (variable === "the_number") {
      variable = "{{iterator}}";
    }

    if (operand === "the_number") {
      operand = "{{iterator}}";
    }

    metadata = {type: "if and modulus", variable: variable, operand: operand};
    g_code   = "if (" + variable + " % " + operand + " == 0) { {{if_body}} }";
    s_code   = "if " + variable + " is divisible by " + operand + ", then";

    append_instruction(g_code, s_code, metadata);
    input_state.push(voice2code.states.IN_CONDITIONAL);
  }

  // Print statement
  result = line.match(/print ([\s\w]+)/i);
  if (result != null && result.length > 0) {
    var variable = result[1].replace(' ', '_');

    metadata = {type: "print"}
    if (variable === "the_number") {
      variable = "{{iterator}}";
    } else if (program_vars.indexOf(variable) == -1) {
      variable = "'" + variable + "'";
    }

    g_code = "console.log(" + variable + ");";
    s_code = "print " + result[1];

    append_instruction(g_code, s_code, metadata);
  }

  
}

// After parsing the vocal instructions, save them to the "program"
function append_instruction(g_code, s_code, metadata) {
  switch (input_state[input_state.length - 1]) {
    case voice2code.states.GLOBAL:
      generated_code.push(g_code);
      spoken_code.push(s_code);
      code_metadata.push(metadata);
      break;

    case voice2code.states.IN_LOOP:
      // Move backwards in the instructions and find one with {{loop_body}}
      var instruction_id = 0;
      for (var i = generated_code.length - 1; i >= 0; i--) {
        if (generated_code[i].indexOf("{{loop_body}}") > -1) {
          instruction_id = i;
          break;
        }
      }

      // Replace any needed tokens
      g_code = g_code.replace("{{iterator}}", code_metadata[i].iterator);

      // Substitute the generated code in for the loop body
      generated_code[i] = generated_code[i].replace("{{loop_body}}", g_code);
      generated_code.push('');

      // If we finished up a loop, lower the state depth
      input_state.pop();

      // Update other code stuff
      spoken_code.push(s_code);
      code_metadata.push(metadata);
      break;

    case voice2code.states.IN_CONDITIONAL:
      // Move backwards in the instructions and find one with {{if_body}}
      var instruction_id = 0;
      for (var i = generated_code.length - 1; i >= 0; i--) {
        if (generated_code[i].indexOf("{{if_body}}") > -1) {
          instruction_id = i;
          break;
        }
      }

      // Substitute tokens
      if (g_code.indexOf('{{iterator}}') > -1) {
        // Move backwards to find the nearest loop
        var loop_inst_id = 0;
          for (var j = code_metadata.length - 1; j >= 0; j--) {
            if (code_metadata[j].type == "loop") {
              loop_inst_id = j;
              break;
            }
          }

        g_code = g_code.replace("{{iterator}}", code_metadata[loop_inst_id].iterator);
      }

      // Substitute the generated code in for the if body
      generated_code[instruction_id] = generated_code[instruction_id].replace("{{if_body}}", g_code);
      generated_code.push('');

      // We finished up a conditional; lower the state depth
      input_state.pop();

      // Update other code stuff
      spoken_code.push(s_code);
      code_metadata.push(metadata);
      break;
  }
}

// Generates a random variable name and returns it
function random_variable() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

  for(var i = 0; i < 12; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

function run_code() {
  eval(generated_code.join(''));
}
