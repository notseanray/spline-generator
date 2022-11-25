use std::io::Error;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn generate_list(equation: Vec<f32>, step: f32, t_stop: u32, max_list: u32) -> Vec<f32> {
    let max_list = max_list as usize;
    let mut t = 0.0;
    let mut list = Vec::with_capacity(max_list);
    while t < t_stop as f32 && list.len() < max_list {
        let mut v = 0.0;
        for (i, poly) in equation.iter().enumerate() {
            if i == 0 { continue; }
            v += poly * t.powf(i as f32);
        }
        list.push(v);
        t += step;
    }
    list
}

type Spline = (Vec<Vec<f32>>, Vec<f32>);
#[wasm_bindgen]
pub fn generate_equation(data: String) -> Vec<f32> {
    let data = Csv::from_str(data).unwrap();
    // this is not the actual size we need
    let constraint_size = data.constraint_size().unwrap_or(0);
    let velocity = data.columns.contains(&"velocity".to_string());
    let (x, y) = data.split();
    let mut uv = Vec::with_capacity(constraint_size);
    let mut max_len = 0;
    let mut initial_pass = true;
    for r in &x.rows {
        let rl = r.len();
        if rl > max_len {
            if !initial_pass && rl < max_len {
                uv.clear();
            }
            max_len = r.len();
        }
        initial_pass = true;
        if rl < max_len {
            continue;
        }
        if let Some(v) = r.first() {
            let v = *v as i32;
            // we always calc 0 anyway
            if v <= 0 {
                continue;
            }
            uv.push(v);
        }
    }
    let constraint_size = uv.len();
    let matrix_dim = (constraint_size + 1) * if velocity { 2 } else { 1 };
    // compute the intial constraints for position and velocity
    let mut constraint_pos = vec![vec![1.0]];
    constraint_pos[0].append(&mut vec![0.0; matrix_dim - 1]);
    let mut constraint_vel = vec![vec![0.0, 1.0]];
    constraint_vel[0].append(&mut vec![0.0; matrix_dim - 2]);
    // we always solve u0 so start from u1..
    for u in uv {
        let mut pos_row = Vec::with_capacity(matrix_dim);
        let mut vel_row = Vec::with_capacity(matrix_dim);
        for col in 0..(matrix_dim as i32) {
            pos_row.push(u.pow(col as u32) as f32);
            vel_row.push((col * (u.pow((col - 1).try_into().unwrap_or(0)))) as f32);
        }
        constraint_pos.push(pos_row);
        constraint_vel.push(vel_row);
    }
    let mut res = row_reduce(
        &mut constraint_pos.clone(),
        &mut constraint_vel.clone(),
        &x.rows,
        velocity,
    )
    .1;
    res.append(&mut row_reduce(&mut constraint_pos, &mut constraint_vel, &y.rows, velocity).1);
    res
}

type M = Vec<Vec<f32>>;

fn scale(row: &mut [f32], scale: f32) {
    for v in row.iter_mut() {
        *v *= scale;
    }
}

fn add(dst: &mut [f32], src: &[f32], value: f32) {
    for (i, v) in dst.iter_mut().enumerate() {
        *v += src[i] * value;
    }
}

fn pivot(m: &M, row: usize) -> usize {
    for (i, v) in m[row].iter().enumerate() {
        if v != &0.0 {
            return i;
        }
    }
    panic!("no pivot")
}

fn row_of_col(m: &M, col: usize) -> Option<usize> {
    let mut rows = vec![];
    for i in 0..m.len() - 1 {
        if pivot(m, i) == col {
            rows.push(i);
        }
    }
    rows.first().copied()
}

fn row_reduce(pos: &mut M, vel: &mut M, direction: &M, velocity: bool) -> Spline {
    let max_len = direction.len();
    // add constraint columns
    for (i, v) in pos.iter_mut().enumerate() {
        if i >= max_len {
            break;
        }
        v.push(direction[i][1]);
    }
    if velocity {
        for (i, v) in vel.iter_mut().enumerate() {
            if i >= max_len || direction[i].len() < 3 {
                break;
            }
            v.push(direction[i][2]);
        }
        pos.append(vel);
    }
    let generated = pos.clone();
    for c in 0..pos[0].len() - 1 {
        let pivot = pivot(pos, c);
        let scale_value = pos[c][pivot];
        scale(&mut pos[c], 1.0 / scale_value);
        for r in 0..pos.len() {
            if r == c {
                continue;
            }
            let add_value = pos[r][pivot];
            let pos_c = pos[c].clone();
            add(&mut pos[r], &pos_c, -add_value);
        }
    }
    let mut row_pos = 0;
    for c in 0..pos[0].len() - 1 {
        let Some(v) = row_of_col(pos, c) else {
            continue;
        };
        pos.swap(v, row_pos);
        row_pos += 1;
    }
    // print answers
    (
        generated,
        pos.iter().filter_map(|x| x.last()).copied().collect(),
    )
}

struct Csv<T> {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<T>>,
}

impl Csv<(f32, f32)> {
    pub fn from_str(data: String) -> Result<Self, Error> {
        let mut columns: Vec<String> = vec![];
        let mut rows: Vec<Vec<(f32, f32)>> = vec![];
        for (i, line) in data.lines().enumerate() {
            // first line take out the col names
            if i == 0 {
                columns = line.split(',').map(|x| x.to_string()).collect();
                continue;
            }
            let line: Vec<(f32, f32)> = line
                .replace(",,", ", ,")
                .split(",\"")
                .enumerate()
                .map(|(i, x)| {
                    let x = x.replace('"', "");
                    if i == 0 {
                        (
                            x.parse().expect("failed to parse"),
                            x.parse().expect("failed to parse"),
                        )
                    } else {
                        let x = x.replace(['(', ')'], "").replace(',', " ");
                        let vals: Vec<&str> = x.split_whitespace().collect();
                        if vals.len() != 2 {
                            panic!("value pair is more than a pair");
                        }
                        let vals: Result<Vec<f32>, _> =
                            vals.into_iter().map(|x| x.parse()).collect();
                        let Ok(vals) = vals else {
                            panic!("failed to parse f32");
                        };
                        (vals[0], vals[1])
                    }
                })
                .collect();
            rows.push(line);
        }
        Ok(Self { columns, rows })
    }

    pub fn constraint_size(&self) -> Option<usize> {
        let Some(v) = self.rows.last() else {
            return None;
        };
        let Some(v) = v.first() else {
            return None;
        };
        Some(v.0 as usize)
    }

    pub fn split(self) -> (Csv<f32>, Csv<f32>) {
        let clen = self.columns.len();
        let rlen = self.rows.len();
        // can potentially remove alloc here by returning 'a csv struct
        let mut x = Csv {
            columns: self.columns.clone(),
            rows: vec![Vec::with_capacity(clen); rlen],
        };
        let mut y = Csv {
            columns: self.columns,
            rows: vec![Vec::with_capacity(clen); rlen],
        };
        for (i, row) in self.rows.iter().enumerate() {
            for value in row {
                x.rows[i].push(value.0);
                y.rows[i].push(value.1);
            }
        }
        (x, y)
    }
}
