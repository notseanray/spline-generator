const process_input = (input) => {
  let data = [];
  let vel = false;
  // potential error message box
  const msg = document.getElementById("error_message");
  // go through line by line
  for (const line of input.split("\n")) {
    // put spaces here so we can process this easily and not care about
    // how the user inputs stuff
    const replaced = line
      .replaceAll("(", " ")
      .replaceAll(")", " ")
      .replaceAll(",", " ");
    let line_data = [];
    // for each token go through, if it's a comment then we can break out
    for (const token of replaced.split(" ")) {
      if (token.startsWith("//")) break;
      try {
        // remove comment block if it exists
        // blocks that have a comment at the end without space could cause issues
        // alternative can replace all "//" with " // ", but this works too
        let v = parseFloat(token.replace("//", ""));
        // i hate js parsing, it can return NaN which makes no sense
        // it is not a number either throw an exception or parse it don't return
        // something that's literally called not a number from something that is
        // supposed to produce a number or an error
        if (!isNaN(v)) {
          line_data.push(v);
        }
      } catch {
        // set error if we fail to parse (aka user is stupid)
        msg.innerText = "error trying to parse float from " + token;
        return {
          status: false,
          value: "",
          constraints: 0,
        };
      }
    }
    // remove empty lines
    if (line_data.length == 0) continue;
    data.push(line_data);
    if (line_data.length == 5) {
      vel = true;
    }
    // we can either have velocity or no velocity, so length must be 3 or 5, otherwise go show error
    if (!(line_data.length == 5 || line_data.length == 3)) {
      msg.innerText = "invalid input for line " + line;
      return {
        status: false,
        value: "",
        constraints: 0,
      };
    }
  }
  /* example csv output to wasm
        constraint,coordinate,velocity
        0,"(0, 0)","(0.70710, 0.70710)"
        1,"(-2,2)","(-0.70710, -0.70710)"
    */
  // absolutely atrocious formatting but too lazy to change the rust code
  // also it is nice to be able to import from csv in the future ig
  let cols = "constraint,coordinate";
  if (vel) {
    cols += ",velocity";
  }
  for (const line of data) {
    cols += `\n${line[0]},"(${line[1]}, ${line[2]})"`;
    if (line.length == 5) {
      cols += `,"(${line[3]}, ${line[4]})"`;
    }
  }
  return {
    status: true,
    value: cols,
    constraints: data.length,
  };
};

let first = true;

const plot = (wasm, realInput) => {
  // keep track of how long it takes
  let time = document.getElementById("time");
  // if it's not the first time delete and remake the dom element for the
  // desmos embed, we have to set the styles again after deleting
  // this is so we don't have like 500 plots if we spam click the button
  if (!first) {
    const calc = document.getElementById("calculator");
    calc.parentNode.removeChild(calc);
    const cparent = document.getElementById("calcparent");
    let newc = document.createElement("calculator");
    newc.id = "calculator";
    cparent.appendChild(newc);
    let calc_again = document.getElementById("calculator");
    calc_again.style.width = "99vw";
    calc_again.style.height = "80vh";
    calc_again.style.left = "0";
    calc_again.style.position = "absolute";
  }
  first = false;
  const start = Date.now();
  // take in input and format it as csv
  const res = process_input(realInput.value);
  // if it was successful then delete any potential error messages

  if (res.status) {
    const msg = document.getElementById("error_message");
    msg.innerText = "";
    const float_trim = parseInt(document.getElementById("ftrim").value) || 5;
    const result = wasm.generate_equation(res.value);
    time.innerHTML = Date.now() - start;
    // since wasm has limited ability to return values we just have one array
    // for both x and y, where first half is x and second half is y
    const mid = result.length / 2;
    const equation_x = result.slice(0, mid);
    let equation_x_str = [];
    // format the equations for desmos
    for (let i = 0; i < equation_x.length; i++) {
      if (i == 0) continue;
      equation_x_str.push(equation_x[i].toFixed(float_trim) + "t^" + i);
    }
    const equation_y = result.slice(mid);
    let equation_y_str = [];
    for (let i = 0; i < equation_y.length; i++) {
      if (i == 0) continue;
      equation_y_str.push(equation_y[i].toFixed(float_trim) + "t^" + i);
    }
    // set parametric domain based on constraint size - 1, otherwise the equation breaks down
    let elt = document.getElementById("calculator");
    let calculator = Desmos.GraphingCalculator(elt);
    calculator.setExpression({
      id: "graph1",
      latex:
        "(" +
        equation_x_str.join(" + ") +
        " , " +
        equation_y_str.join(" + ") +
        ")",
      parametricDomain: { min: "0", max: res.constraints - 1 },
      zoomFit: true,
    });
    return {
      x: equation_x,
      y: equation_y,
      constraints: res.constraints,
    };
  }
};

import("./pkg")
  .then((wasm) => {
    const input = document.querySelector("textarea");
    // disable annoying tab behavior in textarea
    input.addEventListener("keydown", (e) => {
      if (e.key == "Tab") {
        e.preventDefault();
      }
    });
    const realInput = document.getElementById("real");
    const renderBtn = document.getElementById("calc");
    // this is not very elegant but keep track of the result of plotting
    // if we don't plot it's an empty object, we use this to generate the list
    // of x and y values by iterating over t
    let equations = {};
    renderBtn.addEventListener("click", () => {
      try {
        equations = plot(wasm, realInput);
      } catch {
        equations = {};
      }
    });
    const listbtn = document.getElementById("calc_list");
    listbtn.addEventListener("click", () => {
      if (JSON.stringify(equations) != JSON.stringify({})) {
        const start = Date.now();
        const tamtinput = document.getElementById("tatm");
        const tamt = parseInt(tamtinput.value) || 100;
        const tinput = document.getElementById("tstep");
        const tstep = parseFloat(tinput.value) || 0.1;
        const float_trim = parseInt(document.getElementById("ftrim").value);
        const c = equations.constraints;
        const calc_step = c / tamt.toFixed(1);
        // use the value that covers the whole range, increase t step if it's too small
        // so that we cover every value in the domain of the parametric equation
        const step = tstep * tamt > c ? tstep : calc_step;
        tinput.value = step;
        tamtinput.value = c / step;
        const x_list = wasm.generate_list(equations.x, step, c, tamt);
        const y_list = wasm.generate_list(equations.y, step, c, tamt);
        time.innerHTML = Date.now() - start;
        // I tried to iterate/map over the values returned from wasm but maybe
        // they're immutable since it wouldn't let me use toFixed
        let x_str = "[";
        // we already have a global var called first, which is bad idea but oh well
        let first_iter = true;
        // format the results, don't add a comma in front of the first value
        for (const p of x_list) {
          if (first_iter) {
            x_str += `${p.toFixed(float_trim)}`;
            first_iter = false;
          } else {
            x_str += `, ${p.toFixed(float_trim)}`;
          }
        }
        x_str += "]";
        let y_str = "[";
        first_iter = true;
        for (const p of y_list) {
          if (first) {
            y_str += ` ${p.float_trim}`;
            first_iter = false;
          } else {
            y_str += `, ${p.float_trim}`;
          }
        }
        y_str += "]";
        document.getElementById("x_list").innerText = x_str;
        document.getElementById("y_list").innerText = y_str;
      }
    });
    // set default plot
    equations = plot(wasm, realInput);
  })
  .catch(console.error);
