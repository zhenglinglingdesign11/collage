#!/usr/bin/env python3
"""Local FastSAM HTTP server for Sprite Cutter.

Run from the repository root:
  python tools/sprite-cutter/fastsam-server.py

Then open the browser tool and click "FastSAM 分割".
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
import argparse
import base64
import cgi
import json
import sys

import numpy as np
from PIL import Image


def load_fastsam():
    try:
        from ultralytics import FastSAM
    except ImportError:
        print(
            "ultralytics is not installed. Run: python -m pip install -r tools/sprite-cutter/requirements-fastsam.txt",
            file=sys.stderr,
        )
        raise
    return FastSAM


class FastSamHandler(BaseHTTPRequestHandler):
    model = None
    device = None
    imgsz = 1024
    conf = 0.25
    iou = 0.9
    min_area = 800
    max_area_ratio = 0.45
    max_box_area_ratio = 0.55
    max_span_ratio = 0.82
    min_remaining_ratio = 0.55
    edge_grow = 3
    edge_refine = True
    edge_refine_tolerance = 18

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json({"ok": True})
            return
        self.send_error(404)

    def do_POST(self):
        if self.path != "/segment":
            self.send_error(404)
            return

        content_type = self.headers.get("content-type", "")
        if "multipart/form-data" not in content_type:
            self.send_error(400, "Expected multipart/form-data")
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
            },
        )
        file_item = form["image"] if "image" in form else None
        if file_item is None or not getattr(file_item, "file", None):
            self.send_error(400, "Missing image file field")
            return

        source = file_item.file.read()
        try:
            image = open_segmentation_image(source)
            options = {
                "edge_grow": parse_int_field(form, "edgeGrow", type(self).edge_grow),
                "edge_refine": parse_bool_field(form, "edgeRefine", type(self).edge_refine),
                "edge_refine_tolerance": parse_int_field(
                    form,
                    "edgeRefineTolerance",
                    type(self).edge_refine_tolerance,
                ),
            }
            label_png, stats = self.segment_image(image, options)
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, status=500)
            return

        self.send_json(
            {
                "ok": True,
                "count": stats["count"],
                "rawCount": stats["raw_count"],
                "candidateCount": stats["candidate_count"],
                "edgeGrow": options["edge_grow"],
                "width": image.width,
                "height": image.height,
                "labelPng": "data:image/png;base64,"
                + base64.b64encode(label_png).decode("ascii"),
            }
        )

    def segment_image(self, image, options):
        results = type(self).model.predict(
            source=np.array(image),
            imgsz=type(self).imgsz,
            conf=type(self).conf,
            iou=type(self).iou,
            device=type(self).device,
            retina_masks=True,
            verbose=False,
        )
        width, height = image.size
        label = np.zeros((height, width, 4), dtype=np.uint8)
        occupied = np.zeros((height, width), dtype=bool)
        masks = results[0].masks
        if masks is None or masks.data is None:
            return encode_png(label), {"count": 0, "raw_count": 0, "candidate_count": 0}

        mask_data = masks.data.detach().cpu().numpy()
        instances = self.build_instances(mask_data, width, height)
        selected = self.select_instances(instances, width, height, np.array(image), options)

        for count, instance in enumerate(sort_reading_order(selected), start=1):
            r = count & 255
            g = (count >> 8) & 255
            b = (count >> 16) & 255
            mask = instance["mask"]
            label[mask, 0] = r
            label[mask, 1] = g
            label[mask, 2] = b
            label[mask, 3] = 255

        return encode_png(label), {
            "count": len(selected),
            "raw_count": len(mask_data),
            "candidate_count": len(instances),
        }

    def build_instances(self, mask_data, width, height):
        instances = []
        for raw_mask in mask_data:
            mask = normalize_mask(raw_mask, width, height)
            for component in split_connected_components(mask, type(self).min_area):
                instance = describe_mask(component, width, height)
                if self.accept_candidate(instance):
                    instances.append(instance)
        return instances

    def accept_candidate(self, instance):
        if instance["area"] < type(self).min_area:
            return False
        if instance["area_ratio"] > type(self).max_area_ratio:
            return False
        if instance["box_area_ratio"] > type(self).max_box_area_ratio:
            return False

        spans_too_much = (
            instance["width_ratio"] > type(self).max_span_ratio
            and instance["height_ratio"] > 0.28
        ) or (
            instance["height_ratio"] > type(self).max_span_ratio
            and instance["width_ratio"] > 0.28
        )
        if spans_too_much:
            return False

        return True

    def select_instances(self, instances, width, height, image_array, options):
        occupied = np.zeros((height, width), dtype=bool)
        selected = []

        for instance in sort_best_first(instances):
            available = instance["mask"] & ~occupied
            area = int(available.sum())
            if area < type(self).min_area:
                continue

            remaining_ratio = area / max(1, instance["area"])
            if remaining_ratio < type(self).min_remaining_ratio:
                continue

            if self.looks_like_container(instance, selected):
                continue

            selected_instance = describe_mask(available, width, height)
            selected.append(selected_instance)
            occupied |= available

        return self.refine_selected_instances(selected, width, height, image_array, options)

    def refine_selected_instances(self, selected, width, height, image_array, options):
        occupied = np.zeros((height, width), dtype=bool)
        refined = []
        for instance in sort_reading_order(selected):
            mask = instance["mask"] & ~occupied
            if options["edge_refine"]:
                mask = refine_mask_edges(
                    mask,
                    image_array,
                    options["edge_grow"],
                    options["edge_refine_tolerance"],
                ) & ~occupied
            elif options["edge_grow"] > 0:
                mask = grow_mask(mask, options["edge_grow"]) & ~occupied
            if int(mask.sum()) < type(self).min_area:
                continue
            refined_instance = describe_mask(mask, width, height)
            refined.append(refined_instance)
            occupied |= mask
        return refined

    def looks_like_container(self, instance, selected):
        if instance["box_area_ratio"] < 0.16:
            return False

        inside_centers = 0
        for accepted in selected:
            center_x = (accepted["min_x"] + accepted["max_x"]) / 2
            center_y = (accepted["min_y"] + accepted["max_y"]) / 2
            if (
                instance["min_x"] <= center_x <= instance["max_x"]
                and instance["min_y"] <= center_y <= instance["max_y"]
            ):
                inside_centers += 1
                if inside_centers >= 2:
                    return True

        return False

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        print("[fastsam]", format % args)


def encode_png(array):
    buffer = BytesIO()
    Image.fromarray(array, mode="RGBA").save(buffer, format="PNG")
    return buffer.getvalue()


def open_segmentation_image(source):
    image = Image.open(BytesIO(source))
    has_alpha = image.mode in {"RGBA", "LA"} or (
        image.mode == "P" and "transparency" in image.info
    )
    if not has_alpha:
        return image.convert("RGB")

    rgba = image.convert("RGBA")
    background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
    return Image.alpha_composite(background, rgba).convert("RGB")


def parse_int_field(form, name, default):
    if name not in form:
        return default
    try:
        return max(0, int(form[name].value))
    except Exception:
        return default


def parse_bool_field(form, name, default):
    if name not in form:
        return default
    value = str(form[name].value).strip().lower()
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return default


def normalize_mask(raw_mask, width, height):
    mask = raw_mask > 0.5
    if mask.shape == (height, width):
        return mask
    mask_image = Image.fromarray(mask.astype(np.uint8) * 255)
    mask_image = mask_image.resize((width, height), Image.Resampling.NEAREST)
    return np.array(mask_image) > 0


def split_connected_components(mask, min_area):
    try:
        import cv2

        component_count, labels, stats, _ = cv2.connectedComponentsWithStats(
            mask.astype(np.uint8),
            connectivity=8,
        )
        components = []
        for label_id in range(1, component_count):
            area = int(stats[label_id, cv2.CC_STAT_AREA])
            if area < min_area:
                continue
            components.append(labels == label_id)
        return components
    except Exception:
        pass

    visited = np.zeros(mask.shape, dtype=bool)
    height, width = mask.shape
    components = []

    for start_y, start_x in np.argwhere(mask):
        if visited[start_y, start_x]:
            continue

        pixels = []
        stack = [(int(start_x), int(start_y))]
        visited[start_y, start_x] = True

        while stack:
            x, y = stack.pop()
            pixels.append((x, y))

            for nx in range(x - 1, x + 2):
                for ny in range(y - 1, y + 2):
                    if nx == x and ny == y:
                        continue
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    if visited[ny, nx] or not mask[ny, nx]:
                        continue
                    visited[ny, nx] = True
                    stack.append((nx, ny))

        if len(pixels) < min_area:
            continue

        component = np.zeros(mask.shape, dtype=bool)
        xs, ys = zip(*pixels)
        component[np.array(ys), np.array(xs)] = True
        components.append(component)

    return components


def grow_mask(mask, radius):
    if radius <= 0:
        return mask
    try:
        import cv2

        kernel_size = radius * 2 + 1
        kernel = np.ones((kernel_size, kernel_size), dtype=np.uint8)
        return cv2.dilate(mask.astype(np.uint8), kernel, iterations=1) > 0
    except Exception:
        grown = mask.copy()
        height, width = mask.shape
        ys, xs = np.where(mask)
        for y, x in zip(ys, xs):
            y0 = max(0, y - radius)
            y1 = min(height, y + radius + 1)
            x0 = max(0, x - radius)
            x1 = min(width, x + radius + 1)
            grown[y0:y1, x0:x1] = True
        return grown


def refine_mask_edges(mask, image_array, radius, tolerance):
    if radius <= 0:
        return mask
    candidate = grow_mask(mask, radius)
    ring = candidate & ~mask
    if not ring.any():
        return mask

    outer = grow_mask(mask, radius + 7) & ~grow_mask(mask, radius + 2)
    if outer.any():
        background = np.median(image_array[outer].astype(np.int16), axis=0)
    else:
        background = np.array([255, 255, 255], dtype=np.int16)

    pixels = image_array.astype(np.int16)
    color_delta = np.sqrt(np.sum((pixels - background) ** 2, axis=2))

    try:
        import cv2

        gray = cv2.cvtColor(image_array, cv2.COLOR_RGB2GRAY)
        grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        gradient = cv2.magnitude(grad_x, grad_y)
        support = (color_delta > tolerance) | (gradient > 18)
    except Exception:
        support = color_delta > tolerance

    refined = mask | (ring & support)
    if refined.sum() <= mask.sum():
        refined = mask | (grow_mask(mask, 1) & ring)
    return refined


def describe_mask(mask, width, height):
    ys, xs = np.where(mask)
    area = int(len(xs))
    min_x = int(xs.min())
    min_y = int(ys.min())
    max_x = int(xs.max())
    max_y = int(ys.max())
    box_width = max_x - min_x + 1
    box_height = max_y - min_y + 1
    box_area = box_width * box_height
    image_area = width * height
    return {
        "mask": mask,
        "area": area,
        "min_x": min_x,
        "min_y": min_y,
        "max_x": max_x,
        "max_y": max_y,
        "box_width": box_width,
        "box_height": box_height,
        "box_area": box_area,
        "area_ratio": area / image_area,
        "box_area_ratio": box_area / image_area,
        "width_ratio": box_width / width,
        "height_ratio": box_height / height,
        "fill_ratio": area / max(1, box_area),
    }


def sort_best_first(instances):
    return sorted(
        instances,
        key=lambda item: (
            -item["box_area"],
            -item["area"],
            -item["fill_ratio"],
            item["min_y"],
            item["min_x"],
        ),
    )


def sort_reading_order(instances):
    return sorted(instances, key=lambda item: (item["min_y"], item["min_x"], item["area"]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5181)
    parser.add_argument("--model", default="FastSAM-s.pt")
    parser.add_argument("--device", default=None)
    parser.add_argument("--imgsz", type=int, default=1024)
    parser.add_argument("--conf", type=float, default=0.25)
    parser.add_argument("--iou", type=float, default=0.9)
    parser.add_argument("--min-area", type=int, default=800)
    parser.add_argument("--max-area-ratio", type=float, default=0.45)
    parser.add_argument("--max-box-area-ratio", type=float, default=0.55)
    parser.add_argument("--max-span-ratio", type=float, default=0.82)
    parser.add_argument("--min-remaining-ratio", type=float, default=0.55)
    parser.add_argument("--edge-grow", type=int, default=3)
    parser.add_argument("--edge-refine", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--edge-refine-tolerance", type=int, default=18)
    args = parser.parse_args()

    FastSAM = load_fastsam()
    FastSamHandler.model = FastSAM(args.model)
    FastSamHandler.device = args.device
    FastSamHandler.imgsz = args.imgsz
    FastSamHandler.conf = args.conf
    FastSamHandler.iou = args.iou
    FastSamHandler.min_area = args.min_area
    FastSamHandler.max_area_ratio = args.max_area_ratio
    FastSamHandler.max_box_area_ratio = args.max_box_area_ratio
    FastSamHandler.max_span_ratio = args.max_span_ratio
    FastSamHandler.min_remaining_ratio = args.min_remaining_ratio
    FastSamHandler.edge_grow = args.edge_grow
    FastSamHandler.edge_refine = args.edge_refine
    FastSamHandler.edge_refine_tolerance = args.edge_refine_tolerance

    server = ThreadingHTTPServer((args.host, args.port), FastSamHandler)
    print(f"FastSAM server running at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
