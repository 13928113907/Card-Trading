import asyncio
import sys


async def pipe(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while data := await reader.read(65536):
            writer.write(data)
            await writer.drain()
    except (ConnectionError, asyncio.CancelledError):
        pass
    finally:
        writer.close()


async def forward_initial_request(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    advertised_host: str,
    advertised_port: int,
) -> None:
    try:
        headers = await reader.readuntil(b"\r\n\r\n")
        lines = headers.split(b"\r\n")
        for index, line in enumerate(lines):
            if line.lower().startswith(b"host:"):
                lines[index] = (
                    f"Host: {advertised_host}:{advertised_port}".encode()
                )
                break
        headers = b"\r\n".join(lines)
        writer.write(headers)
        await writer.drain()
        await pipe(reader, writer)
    except (asyncio.IncompleteReadError, asyncio.LimitOverrunError):
        writer.close()


async def handle_client(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
    target_host: str,
    target_port: int,
) -> None:
    try:
        target_reader, target_writer = await asyncio.open_connection(
            target_host, target_port
        )
    except OSError:
        client_writer.close()
        return
    advertised_host, advertised_port = client_writer.get_extra_info("sockname")
    await asyncio.gather(
        forward_initial_request(
            client_reader,
            target_writer,
            advertised_host,
            advertised_port,
        ),
        pipe(target_reader, client_writer),
    )


async def main() -> None:
    listen_host, listen_port, target_host, target_port = sys.argv[1:5]
    server = await asyncio.start_server(
        lambda reader, writer: handle_client(
            reader, writer, target_host, int(target_port)
        ),
        listen_host,
        int(listen_port),
    )
    async with server:
        await server.serve_forever()


asyncio.run(main())
