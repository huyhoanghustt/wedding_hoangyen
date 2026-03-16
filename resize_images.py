#!/usr/bin/env python3
"""
Script giảm độ phân giải ảnh trong một thư mục theo tỷ lệ ratio.
"""

import argparse
import os
from pathlib import Path
from PIL import Image


def resize_images(input_dir: str, ratio: float, output_dir: str = "output") -> None:
    """
    Giảm độ phân giải tất cả ảnh trong thư mục input theo tỷ lệ ratio.

    Args:
        input_dir: Đường dẫn thư mục chứa ảnh gốc
        ratio: Tỷ lệ giảm (vd: 2 = giảm 1 nửa, 3 = giảm 1/3)
        output_dir: Thư mục lưu ảnh đã xử lý
    """
    input_path = Path(input_dir)
    output_path = Path(output_dir)

    # Tạo thư mục output nếu chưa tồn tại
    output_path.mkdir(parents=True, exist_ok=True)

    # Các định dạng ảnh được hỗ trợ
    supported_formats = {'.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.tiff'}

    # Lấy danh sách ảnh
    image_files = [
        f for f in input_path.iterdir()
        if f.is_file() and f.suffix.lower() in supported_formats
    ]

    if not image_files:
        print(f"Không tìm thấy ảnh nào trong thư mục: {input_dir}")
        return

    print(f"Tìm thấy {len(image_files)} ảnh.")
    print(f"Đang giảm độ phân giải với tỷ lệ {ratio}x...")
    print(f"Output: {output_dir}")
    print("-" * 50)

    for img_file in image_files:
        try:
            with Image.open(img_file) as img:
                # Xử lý EXIF Orientation trước khi resize
                exif = img.getexif()
                if exif:
                    orientation = exif.get(0x0112)  # 274 = Orientation
                    if orientation == 3:
                        img = img.rotate(180, expand=True)
                    elif orientation == 6:
                        img = img.rotate(270, expand=True)
                    elif orientation == 8:
                        img = img.rotate(90, expand=True)

                original_width, original_height = img.size

                # Tính kích thước mới
                new_width = int(original_width / ratio)
                new_height = int(original_height / ratio)

                # Resize ảnh
                resized_img = img.resize((new_width, new_height), Image.LANCZOS)

                # Lưu ảnh với cùng định dạng
                output_file = output_path / img_file.name
                resized_img.save(output_file, quality=95)

                print(f"✓ {img_file.name}: {original_width}x{original_height} -> {new_width}x{new_height}")

        except Exception as e:
            print(f"✗ Lỗi xử lý {img_file.name}: {e}")

    print("-" * 50)
    print("Hoàn tất!")


def main():
    parser = argparse.ArgumentParser(
        description="Giảm độ phân giải ảnh trong một thư mục"
    )
    parser.add_argument(
        "input_dir",
        help="Thư mục chứa ảnh gốc"
    )
    parser.add_argument(
        "ratio",
        type=float,
        help="Tỷ lệ giảm độ phân giải (vd: 2 = giảm 1 nửa, 3 = giảm 1/3)"
    )
    parser.add_argument(
        "-o", "--output",
        default="output",
        help="Thư mục lưu ảnh đã xử lý (mặc định: output)"
    )

    args = parser.parse_args()

    # Kiểm tra thư mục input
    if not os.path.isdir(args.input_dir):
        print(f"Lỗi: Thư mục input không tồn tại: {args.input_dir}")
        return

    # Kiểm tra ratio hợp lệ
    if args.ratio <= 0:
        print("Lỗi: Ratio phải lớn hơn 0")
        return

    resize_images(args.input_dir, args.ratio, args.output)


if __name__ == "__main__":
    main()
