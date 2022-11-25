const process_input = (input) => {
  let data = [];
  let vel = false;
  const msg = document.getElementById("error_message");
  for (const line of input.split("\n")) {
    const replaced = line
      .replaceAll("(", " ")
      .replaceAll(")", " ")
      .replaceAll(",", " ");
    let line_data = [];
    for (const token of replaced.split(" ")) {
      if (token == "//") break;
      try {
        let v = parseFloat(token);
        if (!isNaN(v)) {
          line_data.push(v);
        }
      } catch {
        msg.innerText = "error trying to parse float from " + token;
        return {
          status: false,
          value: "",
          constraints: 0,
        };
      }
    }
    if (line_data.length == 0) continue;
    data.push(line_data);
    if (line_data.length == 5) {
      vel = true;
    }
    if (!(line_data.length == 5 || line_data.length == 3)) {
      msg.innerText = "invalid input for line " + line;
      return {
        status: false,
        value: "",
        constraints: 0,
      };
    }
  }
  /* example csv input
        constraint,coordinate,velocity
        0,"(0, 0)","(0.70710, 0.70710)"
        1,"(-2,2)","(-0.70710, -0.70710)"
    */
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
  let time = document.getElementById("time");
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
  const res = process_input(realInput.value);
  if (res.status) {
    const float_trim = parseInt(document.getElementById("ftrim").value) || 5;
    const result = wasm.generate_equation(res.value);
    time.innerHTML = Date.now() - start;
    const mid = result.length / 2;
    const equation_x = result.slice(0, mid);
    let equation_x_str = [];
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
    input.addEventListener("keydown", (e) => {
      if (e.key == "Tab") {
        e.preventDefault();
      }
    });
    const realInput = document.getElementById("real");
    const renderBtn = document.getElementById("calc");
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
        const float_trim =
          parseInt(document.getElementById("ftrim").value) || 5;
        const c = equations.constraints;
        const calc_step = c / tamt.toFixed(1);
        const step = tstep * tamt > c ? tstep : calc_step;
        tinput.value = step;
        tamtinput.value = c / step;
        let x_list = wasm.generate_list(equations.x, step, c, tamt);
        let y_list = wasm.generate_list(equations.y, step, c, tamt);
        time.innerHTML = Date.now() - start;
        document.getElementById("x_list").innerText =
          "[" + x_list.map((v) => v.toFixed(float_trim)).join(", ") + "]";
        document.getElementById("y_list").innerText =
          "[" + y_list.map((v) => v.toFixed(float_trim)).join(", ") + "]";
      }
    });
    // default plot
    equations = plot(wasm, realInput);
  })
  .catch(console.error);
